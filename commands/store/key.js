// commands/store/key.js — beli premium key dengan IDR (QRIS / saldo).
// Format: .key | .key <kode paket>
const config = require("../../config");
const logger = require("../../lib/logger");
const { getUserId } = require("../../lib/rpgutil");
const { getPrefix } = require("../../lib/prefix");
const { guarded } = require("../../lib/featureutil");
const autopay = require("../../lib/autopay");

const rp = (n) => `Rp${Number(n || 0).toLocaleString("id-ID")}`;
const packages = () => config.keyPackages || {};

const intro = (p) =>
  [
    `🗝️ *PREMIUM KEY ${config.botName}*`,
    "",
    "Buka premium crate: 1 gold + 3 item",
    "Isi: Elixir x2, Potion, Diamond, Bronze Key, Shadow Key",
    "",
    "*Paket:*",
    ...Object.entries(packages()).map(([, v]) => `• ${v.label} — ${rp(v.price)}`),
    "",
    `Pilih tombol di bawah atau ketik *${p}key <kode>* (contoh: ${p}key 5).`,
    "Bayar QRIS otomatis atau saldo Rp."
  ].join("\n");

const selectRows = () =>
  Object.entries(packages()).map(([key, v]) => ({
    id: `key ${key}`,
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

  const pkgs = packages();
  const key = String(args?.[0] || "").trim();

  if (!key) {
    const text = intro(p);
    try {
      await client.sendInteractiveMessage(sender, {
        text,
        interactiveButtons: [
          {
            name: "single_select",
            buttonParamsJson: JSON.stringify({
              title: "Pilih Paket Key",
              sections: [{ title: "Paket Premium Key", rows: selectRows() }]
            })
          }
        ]
      }, { quoted: message });
    } catch (err) {
      logger.warn(`key: tombol gagal: ${err.message}`);
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

  const isGroup = /@g\.us$/i.test(String(sender));
  const dm = `${uid}@s.whatsapp.net`;
  const target = isGroup ? dm : sender;

  const { inv, reused } = await autopay.createKey({ uid, name, chat: target, origin: sender, key });

  let ok = await autopay.sendInvoice(client, target, inv);
  if (!ok && target !== sender) {
    ok = await autopay.sendInvoice(client, sender, inv);
    await client.sendMessage(
      sender,
      { text: "ℹ️ Chat pribadi tidak bisa dihubungi, jadi tagihan dikirim ke sini." },
      { quoted: message }
    );
  }

  if (isGroup && ok && target !== sender && inv.method !== autopay.SALDO) {
    await client.sendMessage(
      sender,
      { text: `📩 Tagihan *${inv.id}* (${pkg.label}) sudah dikirim ke chat pribadi kamu.` },
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

  logger.cmd(`key: tagihan ${inv.id} ${pkg.label} ${rp(pkg.price)} -> ${uid}${isGroup ? " (DM)" : ""}`);
};

module.exports = {
  name: "key",
  command: ["key", "kunci", "buykey"],
  category: "store",
  visible: true,
  description: "Beli premium key (QRIS / saldo Rp)",
  subcommands: ["<kode paket>"],
  execute: guarded("key", execute)
};
