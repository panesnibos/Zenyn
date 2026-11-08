const crypto = require("crypto");
const { normalizeNumber } = require("../../lib/rpgutil");
const { getPrefix } = require("../../lib/prefix");
const { guarded, identity, reply, interactive, quick, token, timedStore, cooldown } = require("../../lib/featureutil");

const sessions = timedStore();
const execute = async (client, message, args) => {
  const chat = message.key.remoteJid;
  if (!/@g\.us$/i.test(chat)) throw new Error("Undian hanya bisa dipakai di grup.");
  const uid = identity(message);
  let id = token();
  if (args[0] === "draw") {
    const session = sessions.get(args[1]);
    if (!session || session.chat !== chat || session.uid !== uid) return reply(client, message, `⌛ Tombol bukan milikmu atau undian sudah kedaluwarsa. Mulai dengan ${getPrefix(message)}undian.`);
    id = args[1];
  }
  cooldown(message, "undian");
  const meta = await client.groupMetadata(chat);
  const botIds = [client.user?.id, client.user?.lid].filter(Boolean).map(normalizeNumber);
  const members = meta.participants.filter((p) => !p.admin && ![p.id, p.phoneNumber, p.lid].filter(Boolean).some((jid) => botIds.includes(normalizeNumber(jid))));
  if (!members.length) throw new Error("Tidak ada peserta non-admin selain bot.");
  const winner = members[crypto.randomInt(members.length)];
  const label = normalizeNumber(winner.id);
  sessions.set(id, { uid, chat }, 60000);
  return interactive(client, message, `🎉 *UNDIAN GRUP*\n\nPeserta: ${members.length} (tanpa admin/bot)\nTerpilih: @${label}\n\nHanya hiburan, tidak memberikan hadiah otomatis.`,
    [quick("Kocok Lagi", `undian draw ${id}`)], { mentions: [winner.id] });
};

module.exports = {
  name: "undian", command: ["undian", "randommember"], category: "fun", group: true, visible: true,
  description: "Pilih anggota grup acak (tanpa admin/bot), tanpa reward", execute: guarded("undian", execute)
};
