const config = require("../../config");
const logger = require("../../lib/logger");
const { getUserId } = require("../../lib/rpgutil");
const { getPrefix } = require("../../lib/prefix");
const { isOwner } = require("../../lib/owner");
const autopay = require("../../lib/autopay");

const rp = (n) => `Rp${Number(n || 0).toLocaleString("id-ID")}`;
const packages = () => config.addbotPackages || {};
const INVITE_RE = /chat\.whatsapp\.com\/(?:invite\/)?([0-9A-Za-z]{10,})/i;
const RAW_RE = /^[0-9A-Za-z]{10,}$/;

const parseCode = (input) => {
  const text = String(input || "").trim();
  const m = text.match(INVITE_RE);
  if (m) return m[1];
  if (RAW_RE.test(text)) return text;
  return null;
};

const usage = (p) =>
  [
    `🤖 *SEWA BOT UNTUK GRUP*`,
    "",
    `Kirim link undangan grupmu:\n*${p}addbot https://chat.whatsapp.com/XXXXXXXXXXXX*`,
    "",
    "*Harga sewa:*",
    ...Object.entries(packages()).map(([, v]) => `• ${v.label} — ${rp(v.price)}`),
    "",
    "Bot masuk grup otomatis setelah pembayaran QRIS lunas.",
    "Masa sewa habis → bot keluar sendiri."
  ].join("\n");

const selectRows = (code) =>
  Object.entries(packages()).map(([key, v]) => ({
    id: `addbot ${code} ${key}`,
    title: v.label,
    description: rp(v.price)
  }));

const execute = async (client, message, args) => {
  const sender = message.key.remoteJid;
  const p = getPrefix(message);
  const uid = getUserId(message);
  const name = message.pushName || "Player";
  autopay.attach(client);

  if (!uid) {
    return await client.sendMessage(sender, { text: "❌ Tidak bisa mengidentifikasi pengguna." }, { quoted: message });
  }

  const code = parseCode(args?.[0] || "");
  if (!code) {
    return await client.sendMessage(sender, { text: usage(p) }, { quoted: message });
  }

  const planKey = String(args?.[1] || "").trim();
  const pkgs = packages();

  if (!planKey) {
    try {
      await client.sendInteractiveMessage(
        sender,
        {
          text: `🤖 *SEWA BOT*\n\nLink grup: \`${code}\`\n\nPilih durasi sewa:`,
          interactiveButtons: [
            {
              name: "single_select",
              buttonParamsJson: JSON.stringify({
                title: "Pilih Durasi Sewa",
                sections: [{ title: "Durasi Sewa", rows: selectRows(code) }]
              })
            }
          ]
        },
        { quoted: message }
      );
    } catch (err) {
      logger.warn(`addbot: tombol gagal: ${err.message}`);
      await client.sendMessage(sender, { text: usage(p) }, { quoted: message });
    }
    return;
  }

  const pkg = pkgs[planKey];
  if (!pkg) {
    return await client.sendMessage(
      sender,
      { text: `❌ Paket *${planKey}* tidak ada.\nPilihan: ${Object.keys(pkgs).join(", ")}` },
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

    const { inv, reused } = await autopay.createAddbot({
      uid,
      name,
      chat: target,
      origin: sender,
      code,
      key: planKey
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

    logger.cmd(`addbot: tagihan ${inv.id} ${pkg.label} ${rp(pkg.price)} -> ${uid}${isOwner(message) ? " (owner)" : ""}`);
  } catch (err) {
    logger.error(`addbot: ${err.message}`);
    await client.sendMessage(
      sender,
      { text: `${err.user ? "❌" : "⚠️"} ${err.message}` },
      { quoted: message }
    );
  }
};

module.exports = {
  name: "addbot",
  command: ["addbot", "sewabot"],
  category: "main",
  description: "Sewa bot untuk grup via QRIS (1/2/3 bulan / permanent)",
  visible: true,
  execute
};
