// lib/safeurl.js — validasi URL keluar: hanya http(s) publik.
// Dipakai .expand dan .ss supaya fitur tidak bisa dipakai menusuk loopback
// (mis. admin gateway di 127.0.0.1:8081) atau jaringan internal VPS.
const PRIVATE_V4 = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^192\.168\./,
  /^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^172\.(?:1[6-9]|2\d|3[01])\./
];

const normalizeHost = (hostname) =>
  String(hostname || "")
    .toLowerCase()
    .replace(/^\[|\]$/g, "");

const isPrivateHost = (hostname) => {
  const host = normalizeHost(hostname);
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "::1" || host === "::" || host === "0.0.0.0") return true;
  if (host.startsWith("fe80:") || /^f[cd][0-9a-f]{2}:/.test(host)) return true; // link-local & ULA IPv6
  return PRIVATE_V4.some((re) => re.test(host));
};

const assertPublic = (raw) => {
  let url;
  try {
    url = new URL(String(raw || "").trim());
  } catch {
    throw new Error("URL tidak valid.");
  }
  if (!/^https?:$/.test(url.protocol)) throw new Error("Hanya URL http/https yang didukung.");
  if (isPrivateHost(url.hostname)) throw new Error("URL ke jaringan lokal diblokir.");
  return url;
};

module.exports = { assertPublic, isPrivateHost, normalizeHost };
