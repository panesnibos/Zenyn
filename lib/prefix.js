const config = require("../config");

const store = new Map();
const fallback = () => config.prefixes[0] || ".";

const jidOf = (message) => message?.key?.remoteJid || message?.remoteJid || "";

const setPrefix = (message, prefix) => {
  const jid = jidOf(message);
  if (jid && prefix) store.set(jid, prefix);
};

const getPrefixByJid = (jid) => store.get(jid) || fallback();

const getPrefix = (message) => getPrefixByJid(jidOf(message));

module.exports = { setPrefix, getPrefix, getPrefixByJid };
