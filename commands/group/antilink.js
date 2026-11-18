// commands/group/antilink.js — anti-link per grup.
// Hanya admin grup yang boleh memakai; menyalakan butuh bot sudah admin.
const { getPrefix } = require("../../lib/prefix");
const { guarded, reply } = require("../../lib/featureutil");
const { getSenderJids, normalizeNumber } = require("../../lib/rpgutil");
const antilink = require("../../lib/antilink");

const listText = (domains) =>
  domains.length ? domains.map((d, i) => `${i + 1}. ${d}`).join("\n") : "(kosong)";

const helpText = (p, state, botAdmin) =>
  [
    "🔗 *ANTILINK GRUP*",
    "",
    `Status    : ${state.enabled ? "✅ ON" : "⛔ OFF"}`,
    `Bot admin : ${botAdmin ? "✅ ya" : "❌ belum"}`,
    `Aturan    : ${antilink.MAX_WARN}x kirim link terlarang = keluar grup`,
    "",
    "*Domain diblokir:*",
    listText(state.blocked),
    "",
    `• ${p}antilink on / off`,
    `• ${p}antilink add domain.com`,
    `• ${p}antilink delete 1`,
    "",
    "Hanya admin grup. Bot wajib admin untuk menghapus pesan & mengeluarkan."
  ].join("\n");

const execute = async (client, message, args) => {
  const chat = message.key.remoteJid;
  const p = getPrefix(message);
  if (!/@g\.us$/i.test(String(chat))) throw new Error("Antilink hanya bisa dipakai di grup.");

  const meta = await client.groupMetadata(chat);
  const me = antilink.participantOf(meta, getSenderJids(message));
  if (!antilink.isAdmin(me)) throw new Error("Hanya admin grup yang bisa memakai antilink.");

  const botAdmin = antilink.isAdmin(antilink.participantOf(meta, [client.user?.id, client.user?.lid]));
  const sub = String(args[0] || "").toLowerCase();
  const state = antilink.get(chat);

  if (!sub || sub === "status") return reply(client, message, helpText(p, state, botAdmin));

  if (sub === "on" || sub === "off") {
    if (sub === "on" && !botAdmin) throw new Error("Jadikan bot admin grup dulu, baru antilink bisa dinyalakan.");
    const on = antilink.setEnabled(chat, sub === "on");
    return reply(
      client,
      message,
      on
        ? `✅ Antilink *ON*.\nLink ${listText(antilink.get(chat).blocked)} akan dihapus, pengirim dapat peringatan (${antilink.MAX_WARN}x = keluar).`
        : "⛔ Antilink *OFF*. Tidak ada link yang dihapus di grup ini."
    );
  }

  if (sub === "add") {
    const domain = antilink.addDomain(chat, args.slice(1).join(" "));
    return reply(client, message, `✅ Domain *${domain}* ditambahkan.\n\n${listText(antilink.get(chat).blocked)}`);
  }

  if (sub === "delete" || sub === "del") {
    const removed = antilink.removeDomain(chat, args[1]);
    return reply(client, message, `🗑️ Domain *${removed}* dihapus.\n\n${listText(antilink.get(chat).blocked)}`);
  }

  return reply(client, message, helpText(p, state, botAdmin));
};

module.exports = {
  name: "antilink",
  command: ["antilink", "antilinkgc"],
  category: "group",
  visible: true,
  group: true,
  description: "Anti-link grup: hapus link, 3x peringatan = keluar (admin grup)",
  subcommands: ["on", "off", "add <domain>", "delete <nomor>"],
  execute: guarded("antilink", execute)
};
