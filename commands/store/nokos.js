// commands/store/nokos.js — beli nomor virtual untuk OTP (nokos) lewat AutoOrder.
// Alur: pilih layanan -> pilih negara/paket -> bayar QRIS -> nomor dikirim + OTP otomatis.
const config = require("../../config");
const logger = require("../../lib/logger");
const ao = require("../../lib/autoorder");
const nokos = require("../../lib/nokos");
const autopay = require("../../lib/autopay");
const { getUserId } = require("../../lib/rpgutil");
const { getPrefix } = require("../../lib/prefix");
const { isOwner } = require("../../lib/owner");

const rp = (n) => nokos.rp(n);
const cut = (s, n) => (String(s || "").length > n ? String(s).slice(0, n - 1) + "…" : String(s || ""));

// 8 produk + maks 2 baris navigasi = 10 baris (batas aman list WhatsApp)
const pageSize = () => Math.min(9, Math.max(1, Number(config.nokos?.pageSize ?? 8)));

const b64e = (s) => Buffer.from(String(s || ""), "utf8").toString("base64url");
const b64d = (s) => {
  try {
    return Buffer.from(String(s || ""), "base64url").toString("utf8");
  } catch {
    return "";
  }
};

const offerPrice = (o) => nokos.sellPrice(o?.price);

// urutan prioritas layanan populer di daftar awal
const POPULAR = [
  /whatsapp/i,
  /telegram/i,
  /instagram|threads/i,
  /facebook/i,
  /google|gmail|youtube/i,
  /tiktok|douyin/i,
  /twitter/i,
  /discord/i,
  /shopee/i,
  /gojek|grab/i,
  /netflix/i,
  /spotify/i,
  /apple/i,
  /microsoft|outlook/i,
  /line\b/i,
  /amazon/i
];

const popularity = (s) => {
  const name = String(s?.name || "");
  const i = POPULAR.findIndex((re) => re.test(name));
  return i === -1 ? POPULAR.length : i;
};

const sortServices = (list) =>
  list.slice().sort(
    (a, b) => popularity(a) - popularity(b) || String(a.name).localeCompare(String(b.name))
  );

const offerList = (offers) =>
  (Array.isArray(offers) ? offers : [])
    .filter((o) => o.available === undefined || Number(o.available) > 0)
    .sort((a, b) => Number(a.price) - Number(b.price));

// ---------- filter (tier/negara) ----------
const parseFilters = (args) => {
  let tier;
  let country;
  for (const a of args) {
    const t = String(a || "").toLowerCase();
    if (!t) continue;
    if (t === "ekonomi" || t === "economy") tier = "ekonomi";
    else if (t === "standar" || t === "standard") tier = "standar";
    else if (!country) country = t;
  }
  return { tier, country };
};

const filterToken = (args) => (args.length ? `f=${b64e(args.join(" "))}` : null);
const tokenArgs = (token) =>
  String(token || "").startsWith("f=") ? b64d(String(token).slice(2)).split(" ").filter(Boolean) : [];

const clampPage = (page, total) => {
  const last = Math.max(0, Math.ceil(total / pageSize()) - 1);
  return Math.min(Math.max(0, Number(page) || 0), last);
};

const navRows = (page, total, makeId) => {
  const pages = Math.max(1, Math.ceil(total / pageSize()));
  const rows = [];
  if (page > 0) {
    rows.push({ id: makeId(page - 1), title: "⬅️ Sebelumnya", description: `Halaman ${page}/${pages}` });
  }
  if (page < pages - 1) {
    rows.push({ id: makeId(page + 1), title: "➡️ Selanjutnya", description: `Halaman ${page + 2}/${pages}` });
  }
  return rows;
};

const usage = (p) =>
  [
    "📱 *NOMOR VIRTUAL (OTP)*",
    "",
    "Beli nomor virtual untuk terima kode OTP. Bayar via QRIS otomatis.",
    "",
    `• ${p}nokos — daftar layanan`,
    `• ${p}nokos <nama layanan> — cari layanan`,
    `• ${p}nokos svc <id> — harga per negara/paket`,
    `• ${p}nokoscek [order] — cek status & OTP`,
    `• ${p}nokosbatal <order> — batalkan pesanan`,
    `• ${p}nokosriwayat — riwayat pesanan`,
    "",
    "Tombol ⬅️/➡️ untuk pindah halaman.",
    "Setelah dibayar, nomor & kode OTP dikirim otomatis ke chat ini."
  ].join("\n");

const serviceNameOf = async (serviceId) => {
  try {
    const all = (await ao.nokosServices()) || [];
    const hit = all.find((s) => String(s.id) === String(serviceId));
    return hit ? hit.name : "";
  } catch {
    return "";
  }
};

const serviceRows = (list) =>
  list.map((s) => ({ id: `nokos svc ${s.id}`, title: cut(s.name, 24), description: cut(s.category || s.id, 72) }));

const offerRows = (list, serviceId, startIndex, filterTok) =>
  list.map((o, i) => ({
    id: `nokos buy ${serviceId} ${startIndex + i}${filterTok ? ` ${filterTok}` : ""}`,
    title: cut(`${o.countryEmoji || ""} ${o.countryName || o.country || "-"} ${o.tierLabel || o.tier || ""}`.trim(), 24),
    description: cut(`${rp(offerPrice(o))} • stok ${o.available ?? "?"}`, 72)
  }));

const sendList = async (client, message, title, rows, fallbackText) => {
  try {
    await client.sendInteractiveMessage(
      message.key.remoteJid,
      {
        text: fallbackText,
        interactiveButtons: [
          { name: "single_select", buttonParamsJson: JSON.stringify({ title, sections: [{ title, rows }] }) }
        ]
      },
      { quoted: message }
    );
    return true;
  } catch (err) {
    logger.warn(`nokos: tombol gagal: ${err.message}`);
    await client.sendMessage(message.key.remoteJid, { text: fallbackText }, { quoted: message });
    return false;
  }
};

// ---------- daftar layanan ----------
const listServices = async (client, message, query, page, p) => {
  const all = (await ao.nokosServices()) || [];
  const q = String(query || "").toLowerCase().trim();
  const found = all.filter((s) => !q || `${s.name} ${s.category || ""} ${s.id}`.toLowerCase().includes(q));

  if (!found.length) {
    return client.sendMessage(
      message.key.remoteJid,
      { text: q ? `Layanan "${query}" tidak ditemukan. Coba *${p}nokos*.` : "Belum ada layanan tersedia." },
      { quoted: message }
    );
  }

  const sorted = sortServices(found);
  const cur = clampPage(page, sorted.length);
  const size = pageSize();
  const items = sorted.slice(cur * size, cur * size + size);
  const pages = Math.max(1, Math.ceil(sorted.length / size));

  const nav = navRows(cur, sorted.length, (n) =>
    `nokos list ${n}${q ? ` q=${b64e(query)}` : ""}`
  );

  const body = [
    "📱 *NOMOR VIRTUAL (OTP)*",
    "",
    `Halaman ${cur + 1}/${pages} • ${sorted.length} layanan${q ? ` untuk "${query}"` : ""}`,
    `Cari layanan lain: *${p}nokos <nama>*`,
    "",
    ...items.map((s) => `• ${s.name} — id: ${s.id}`)
  ].join("\n");

  await sendList(client, message, "Pilih Layanan", [...serviceRows(items), ...nav], body);
};

// ---------- daftar penawaran ----------
const listOffers = async (client, message, serviceId, page, filterArgs, p) => {
  if (!serviceId) {
    return client.sendMessage(
      message.key.remoteJid,
      { text: `Format: *${p}nokos svc <id layanan>*\nLihat id di *${p}nokos*.` },
      { quoted: message }
    );
  }

  const { tier, country } = parseFilters(filterArgs);
  const offers = offerList(await ao.nokosOffers(serviceId, { tier, country }));
  if (!offers.length) {
    return client.sendMessage(
      message.key.remoteJid,
      { text: `Tidak ada penawaran untuk pilihan itu. Coba *${p}nokos svc ${serviceId}*.` },
      { quoted: message }
    );
  }

  const cur = clampPage(page, offers.length);
  const size = pageSize();
  const items = offers.slice(cur * size, cur * size + size);
  const pages = Math.max(1, Math.ceil(offers.length / size));
  const filterTok = filterToken(filterArgs);

  const nav = navRows(cur, offers.length, (n) =>
    `nokos svc ${serviceId} ${n}${filterTok ? ` ${filterTok}` : ""}`
  );

  const body = [
    "📱 *PILIH NEGARA & PAKET*",
    "",
    `Halaman ${cur + 1}/${pages} • ${offers.length} penawaran (termurah dulu)`,
    "Pilih lewat tombol untuk memesan.",
    "",
    ...items.map(
      (o) =>
        `• ${o.countryName || o.country} | ${o.tierLabel || o.tier} | ${rp(offerPrice(o))} | stok ${o.available ?? "?"}`
    )
  ].join("\n");

  await sendList(client, message, "Pilih Negara & Paket", [...offerRows(items, serviceId, cur * size, filterTok), ...nav], body);
};

// ---------- beli ----------
const buyOffer = async (client, message, serviceId, indexArg, filterArgs, uid, name, p) => {
  const idx = Number(indexArg);
  if (!serviceId || !Number.isInteger(idx) || idx < 0) {
    return client.sendMessage(
      message.key.remoteJid,
      { text: `Format: *${p}nokos buy <id layanan> <nomor>*\nLihat daftar di *${p}nokos svc <id>*.` },
      { quoted: message }
    );
  }

  const { tier, country } = parseFilters(filterArgs);
  const offers = offerList(await ao.nokosOffers(serviceId, { tier, country }));
  const offer = offers[idx];
  if (!offer) {
    return client.sendMessage(
      message.key.remoteJid,
      { text: `Penawaran berubah. Ulangi: *${p}nokos svc ${serviceId}*.` },
      { quoted: message }
    );
  }

  const isGroup = /@g\.us$/i.test(String(message.key.remoteJid));
  const sender = message.key.remoteJid;
  const dm = `${uid}@s.whatsapp.net`;
  const target = isGroup ? dm : sender;

  const { inv, reused } = await autopay.createNokos({
    uid,
    name,
    chat: target,
    origin: sender,
    serviceId,
    serviceName: offer.serviceName || (await serviceNameOf(serviceId)),
    offerId: offer.offerId || offer.id,
    countryName: offer.countryName || offer.country || "",
    countryCode: offer.countryCode || "",
    tier: offer.tier || "",
    tierLabel: offer.tierLabel || "",
    apiPrice: offer.price
  });

  let ok = await autopay.sendInvoice(client, target, inv);
  if (!ok && target !== sender) {
    ok = await autopay.sendInvoice(client, sender, inv);
    await client.sendMessage(
      sender,
      { text: "ℹ️ Chat pribadi tidak bisa dihubungi, jadi tagihan dikirim ke sini." },
      { quoted: message }
    );
  }

  if (isGroup && ok && target !== sender) {
    await client.sendMessage(
      sender,
      { text: `📩 Tagihan *${inv.id}* sudah dikirim ke chat pribadi kamu.` },
      { quoted: message }
    );
  }

  if (reused) {
    await client.sendMessage(
      sender,
      { text: `ℹ️ Melanjutkan tagihan *${inv.id}* yang masih aktif.` },
      { quoted: message }
    );
  }

  logger.cmd(`nokos: tagihan ${inv.id} ${offer.countryName || ""} ${rp(offerPrice(offer))} -> ${uid}`);
};

// ---------- cek / batal / riwayat ----------
const checkOrder = async (client, message, arg, uid, p) => {
  const o =
    (arg ? nokos.get(arg) : null) ||
    nokos.list((x) => x.status === "pending" && nokos.same(x.buyer, uid))[0];
  if (!o) {
    return client.sendMessage(
      message.key.remoteJid,
      { text: `Pesanan tidak ditemukan. Lihat *${p}nokosriwayat*.` },
      { quoted: message }
    );
  }
  if (!isOwner(message) && !nokos.same(o.buyer, uid)) {
    return client.sendMessage(message.key.remoteJid, { text: "Pesanan ini bukan milikmu." }, { quoted: message });
  }
  await nokos.check(o, { force: true });
  await client.sendMessage(message.key.remoteJid, { text: nokos.orderText(o, "STATUS NOMOR") }, { quoted: message });
};

const cancelOrder = async (client, message, arg, uid, p) => {
  const o = arg ? nokos.get(arg) : null;
  if (!o) {
    return client.sendMessage(message.key.remoteJid, { text: `Format: *${p}nokosbatal <order>*.` }, { quoted: message });
  }
  if (!isOwner(message) && !nokos.same(o.buyer, uid)) {
    return client.sendMessage(message.key.remoteJid, { text: "Pesanan ini bukan milikmu." }, { quoted: message });
  }
  await nokos.cancel(o);
  await client.sendMessage(
    message.key.remoteJid,
    {
      text: `Pesanan *${o.orderId}* dibatalkan.\n\nKarena pembayaran lewat QRIS, dana dikembalikan manual oleh owner (hubungi owner bila belum diterima).`
    },
    { quoted: message }
  );
};

const history = async (client, message, uid, p) => {
  const mine = nokos.list((x) => isOwner(message) || nokos.same(x.buyer, uid)).slice(0, 10);
  if (!mine.length) {
    return client.sendMessage(message.key.remoteJid, { text: "Belum ada pesanan nomor." }, { quoted: message });
  }
  const body = [
    "📜 *RIWAYAT NOMOR VIRTUAL*",
    "",
    ...mine.map(
      (o) =>
        `• ${o.orderId} | ${o.serviceName} | ${o.country || "-"} | ${o.phone || "-"} | ${String(o.status).toUpperCase()}${
          isOwner(message) ? ` | ${o.buyer}` : ""
        }`
    )
  ].join("\n");

  await client.sendMessage(message.key.remoteJid, { text: body }, { quoted: message });
};

// ---------- parser sub-command ----------
const splitParams = (tokens) => {
  let page = 0;
  const filters = [];
  for (const t of tokens) {
    const s = String(t || "");
    if (!s) continue;
    if (/^\d+$/.test(s)) page = Number(s);
    else if (s.startsWith("f=")) filters.push(...tokenArgs(s));
    else filters.push(s);
  }
  return { page, filters };
};

const execute = async (client, message, args, commands, command) => {
  const sender = message.key.remoteJid;
  const p = getPrefix(message);
  const uid = getUserId(message);
  const name = message.pushName || "Player";

  nokos.attach(client);
  autopay.attach(client);
  nokos.start();

  const fail = async (err) => {
    if (err && err.user) {
      return client.sendMessage(sender, { text: `❌ ${err.message}` }, { quoted: message });
    }
    logger.error(`nokos: ${err.message}`);
    if (err && err.code === "NO_KEY") {
      return client.sendMessage(
        sender,
        { text: isOwner(message) ? err.message : "Fitur nomor virtual belum diaktifkan owner." },
        { quoted: message }
      );
    }
    return client.sendMessage(
      sender,
      { text: `⚠️ ${err.message}\nCoba lagi sebentar lagi, atau hubungi owner.` },
      { quoted: message }
    );
  };

  if (!uid) {
    return client.sendMessage(sender, { text: "❌ Tidak bisa mengidentifikasi pengguna." }, { quoted: message });
  }

  if (!ao.enabled()) {
    return client.sendMessage(
      sender,
      {
        text: isOwner(message)
          ? "Nokos belum aktif: isi env AUTOORDER_API_KEY di server."
          : "Fitur nomor virtual belum diaktifkan owner."
      },
      { quoted: message }
    );
  }

  if (config.nokos?.enabled === false) {
    return client.sendMessage(
      sender,
      { text: isOwner(message) ? "Nokos dimatikan (config.nokos.enabled = false)." : "Fitur nomor virtual sedang nonaktif." },
      { quoted: message }
    );
  }

  try {
    if (command === "nokoscek" || command === "nokoscheck") {
      return await checkOrder(client, message, args[0], uid, p);
    }
    if (command === "nokosbatal" || command === "nokoscancel") {
      return await cancelOrder(client, message, args[0], uid, p);
    }
    if (command === "nokosriwayat" || command === "nokoshistory") {
      return await history(client, message, uid, p);
    }

    const sub = String(args[0] || "").toLowerCase();
    if (sub === "help" || sub === "bantuan") {
      return await client.sendMessage(sender, { text: usage(p) }, { quoted: message });
    }

    if (sub === "svc") {
      const serviceId = args[1];
      const { page, filters } = splitParams(args.slice(2));
      return await listOffers(client, message, serviceId, page, filters, p);
    }

    if (sub === "buy") {
      const serviceId = args[1];
      const { filters } = splitParams(args.slice(3));
      return await buyOffer(client, message, serviceId, args[2], filters, uid, name, p);
    }

    if (sub === "cek") return await checkOrder(client, message, args[1], uid, p);
    if (sub === "batal") return await cancelOrder(client, message, args[1], uid, p);

    if (sub === "list") {
      const page = /^\d+$/.test(String(args[1] || "")) ? Number(args[1]) : 0;
      const qToken = String(args[2] || "");
      const query = qToken.startsWith("q=") ? b64d(qToken.slice(2)) : "";
      return await listServices(client, message, query, page, p);
    }

    const query = args.join(" ").trim();
    if (!query) return await listServices(client, message, "", 0, p);
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query)) {
      return await listOffers(client, message, query, 0, [], p);
    }
    return await listServices(client, message, query, 0, p);
  } catch (err) {
    return await fail(err);
  }
};

module.exports = {
  name: "nokos",
  command: ["nokos", "nokoscek", "nokosbatal", "nokosriwayat"],
  category: "store",
  description: "Beli nomor virtual OTP via QRIS (AutoOrder)",
  visible: true,
  execute
};
