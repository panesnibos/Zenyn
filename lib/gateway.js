// lib/gateway.js — deteksi grup "Gateway" (tujuan alert gateway, diblacklist dari fitur umum).
const fs = require("fs");
const path = require("path");
const logger = require("./logger");
const config = require("../config");

const FILE = path.join(__dirname, "../database/gateway.json");
const TTL = 6 * 60 * 60 * 1000;
let cache = null;

const load = () => {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(FILE, "utf8")) || {};
  } catch {
    cache = {};
  }
  return cache;
};

const save = (data) => {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    logger.warn(`gateway: gagal simpan cache (${err.message})`);
  }
};

const nameMatches = (name) => /gateway/i.test(String(name || ""));
const envJid = () => String(process.env.GATEWAY_JID || config.gatewayJid || "").trim() || null;

const resolve = async (client, { force = false } = {}) => {
  const fixed = envJid();
  if (fixed) return fixed;

  const data = load();
  if (!force && data.jid && Date.now() - (data.at || 0) < TTL) return data.jid;

  try {
    const groups = await client.groupFetchAllParticipating();
    const hit = Object.entries(groups || {}).find(([, g]) => nameMatches(g?.subject));
    if (hit) {
      cache = { jid: hit[0], name: hit[1]?.subject || "", at: Date.now() };
      save(cache);
      return hit[0];
    }
  } catch (err) {
    logger.warn(`gateway: gagal ambil daftar grup (${err.message})`);
  }

  return data.jid || null;
};

const isGateway = async (client, jid) => {
  if (!jid) return false;
  const target = await resolve(client);
  return !!target && String(target) === String(jid);
};

module.exports = { resolve, isGateway, nameMatches, FILE, forget: () => { cache = null; } };
