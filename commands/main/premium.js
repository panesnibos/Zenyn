const config = require("../../config");
const logger = require("../../lib/logger");
const { db } = require("../../lib/rpgdb");
const { getUserId } = require("../../lib/rpgutil");
const { getPrefix } = require("../../lib/prefix");
const { statusOf, PERMANENT } = require("../../lib/rpglimit");
const autopay = require("../../lib/autopay");

const rp = (n) => `Rp${Number(n || 0).toLocaleString("id-ID")}`;
const packages = () => config.premiumPackages || {};

const statusLine = (user) => {
  const type = statusOf(user);
  const until = user?.status?.until;
  if (type === "User") return "Status kamu: *User* (belum premium)";
  const sisa = until === PERMANENT || until === null || until === undefined
    ? "Selamanya"
    : new Date(until).toLocaleString("id-ID");
  return `Status kamu: *${type}* • sampai ${sisa}`;
};

const intro = (p, user) =>
  [
    `👑 *PREMIUM ${config.botName}*`,
    "",
    statusLine(user),
    "",
    "*Benefit Premium:*",
    "• Limit harian ∞ (tanpa batas)",
    "• Semua fitur tools & downloader terbuka",
    "• Prioritas respon bot",
    "",
    "*Paket tersedia:*",
    ...Object.entries(packages()).map(([, v]) => `• ${v.label} — ${rp(v.price)}`),
    "",
    `Pilih tombol di bawah atau ketik *${p}premium <kode>* (contoh: ${p}premium 30).`
  ].join("\n");

const selectRows = () =>
  Object.entries(packages()).map(([key, v]) => ({
    id: `premium ${key}`,
    title: v.label,
    description: rp(v.price)
  }));

const execute = async (client, message, args) => {
  const sender = message.key.remoteJid;
  autopay.attach(client);
  const p = getPrefix(message);
  const uid = getUserId(message);
  const name = message.pushName || "Player";

  if (!uid) {
    return await client.sendMessage(sender, { text: "❌ Tidak bisa mengidentifikasi pengguna." }, { quoted: message });
  }

  const user = db.getUser(uid, name);
  const pkgs = packages();
  const key = String(args?.[0] || "").trim();

  if (!key) {
    const text = intro(p, user);
    try {
      await client.sendInteractiveMessage(
        sender,
        {
          text,
          interactiveButtons: [
            {
              name: "single_select",
              buttonParamsJson: JSON.stringify({
                title: "Pilih Paket Premium",
                sections: [{ title: "Paket Premium", rows: selectRows() }]
              })
            }
          ]
        },
        { quoted: message }
      );
    } catch (err) {
      logger.warn(`premium: tombol gagal: ${err.message}`);
      await client.sendMessage(sender, { text }, { quoted: message });
    }
    return;
  }

  const pkg = pkgs[key];
  if (!pkg) {
    return await client.sendMessage(
      sender,
      { text: `❌ Paket *${key}* tidak ada.\nPilihan: ${Object.keys(pkgs).join(", ")}` },
      { quoted: message }
    );
  }

  if (!autopay.enabled()) {
    return await client.sendMessage(
      sender,
      { text: "⚠️ Pembayaran QRIS otomatis belum aktif. Hubungi owner." },
      { quoted: message }
    );
  }

  try {
    const isGroup = /@g\.us$/i.test(String(sender));
    const dm = `${uid}@s.whatsapp.net`;
    const target = isGroup ? dm : sender;

    const { inv, reused } = await autopay.createPremium({
      uid,
      name,
      chat: target,
      origin: sender,
      key
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
        {
          text: `📩 Tagihan *${inv.id}* (${pkg.label}) sudah dikirim ke chat pribadi kamu. Lanjutkan pembayaran di sana.`
        },
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
    logger.cmd(`premium: tagihan ${inv.id} ${pkg.label} ${rp(pkg.price)} -> ${uid}${isGroup ? " (DM)" : ""}`);
  } catch (err) {
    logger.error(`premium: ${err.message}`);
    await client.sendMessage(
      sender,
      { text: `${err.user ? "❌" : "⚠️"} ${err.message}` },
      { quoted: message }
    );
  }
};

module.exports = {
  name: "premium",
  command: ["premium", "prem"],
  category: "main",
  description: "Beli premium (tombol durasi + pembayaran QRIS otomatis)",
  visible: true,
  execute
};
