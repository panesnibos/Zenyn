const config = require("../config");

const normalize = (v) => String(v || "").split("@")[0].replace(/\D/g, "").trim();

const ownerNumbers = (config.owners || []).map(normalize).filter(Boolean);

const getSenderNumbers = (message) => {
  const k = message.key || {};
  return [
    k.participant,
    k.remoteJid,
    k.senderPn,
    k.participantPn,
    k.remoteJidAlt,
    k.participantAlt,
  ]
    .map(normalize)
    .filter(Boolean);
};

const getSenderNumber = (message) => getSenderNumbers(message)[0] || "";

const isOwner = (message) => getSenderNumbers(message).some((n) => ownerNumbers.includes(n));

module.exports = { isOwner, getSenderNumber, getSenderNumbers, ownerNumbers, normalize };
