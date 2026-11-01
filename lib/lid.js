const path = require("path");
const { readJson, writeJson } = require("./rpgjson");

const MAP_PATH = path.join(__dirname, "../database/lidmap.json");

let cache = null;

const load = () => {
  if (!cache) cache = readJson(MAP_PATH, {});
  return cache;
};

const save = (data) => {
  cache = data;
  writeJson(MAP_PATH, data);
};

const normalize = (jid) => {
  let value = String(jid || "").replace(/^@/, "");
  value = value.split("@")[0];
  value = value.split(":")[0];
  return value.replace(/\D/g, "").trim();
};

const isLidJid = (jid) => /@(lid|hosted\.lid)$/i.test(String(jid || ""));
const isPnJid = (jid) => /@(s\.whatsapp\.net|hosted)$/i.test(String(jid || ""));

const recordMapping = (lid, pn) => {
  if (!lid || !pn) return false;
  const lidId = normalize(lid);
  const pnId = normalize(pn);
  if (!lidId || !pnId || lidId === pnId) return false;

  const data = load();
  if (data[lidId] === pnId) return false;

  data[lidId] = pnId;
  save(data);
  return true;
};

const recordFromKey = (key) => {
  if (!key) return;
  const pairs = [
    [key.participant, key.participantAlt],
    [key.participant, key.senderPn],
    [key.remoteJid, key.remoteJidAlt],
    [key.remoteJid, key.senderPn],
    [key.participantPn, key.participantAlt]
  ];

  for (const [a, b] of pairs) {
    if (!a || !b) continue;
    if (isLidJid(a) && isPnJid(b)) recordMapping(a, b);
    else if (isPnJid(a) && isLidJid(b)) recordMapping(b, a);
  }
};

const cachedPn = (jidOrId) => {
  const id = normalize(jidOrId);
  if (!id) return null;
  return load()[id] || null;
};

const resolvePn = async (client, jidOrId) => {
  const raw = String(jidOrId || "");
  const id = normalize(raw);
  if (!id) return null;

  const cached = cachedPn(id);
  if (cached) return cached;

  if (isLidJid(raw) && client?.signalRepository?.lidMapping?.getPNForLID) {
    try {
      const pn = await client.signalRepository.lidMapping.getPNForLID(raw);
      if (pn) {
        recordMapping(raw, pn);
        return normalize(pn);
      }
    } catch {}
  }

  return id;
};

module.exports = {
  normalize,
  isLidJid,
  isPnJid,
  recordMapping,
  recordFromKey,
  cachedPn,
  resolvePn
};
