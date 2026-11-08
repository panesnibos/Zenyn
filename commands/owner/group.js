// commands/owner/group.js — kelola grup bot (owner): daftar grup + masa sewa,
// tambah durasi, keluar grup (dengan konfirmasi), dan join lewat link undangan.
// Format: .group | .group <jid> | .group <jid> add [hari] | .group <jid> leave
//         .group join <link> [hari] | .group list <halaman>
const config = require("../../config");
const logger = require("../../lib/logger");
const addbot = require("../../lib/addbot");
const { isOwner } = require("../../lib/owner");
const { getPrefix } = require("../../lib/prefix");

const PAGE = 10;
const CACHE_MS = 30 * 1000;
const INVITE_RE = /chat\.whatsapp\.com\/(?:invite\/)?([0-9A-Za-z]{10,})/i;
const RAW_RE = /^[0-9A-Za-z]{10,}$/;
const JID_RE = /@g\.us$/i;

let cache = { at: 0, map: {} };

const parseCode = (input) => {
  const text = String(input || "").trim();
  const m = text.match(INVITE_RE);
  if (m) return m[1];
  if (RAW_RE.test(text)) return text;
  return null;
};

const clip = (value, max) => {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

const send = (client, jid, message, text) => client.sendMessage(jid, { text }, { quoted: message });

const sendButtons = async (client, jid, message, payload) => {
  try {
    await client.sendInteractiveMessage(jid, payload, { quoted: message });
  } catch (err) {
    logger.warn(`group: tombol gagal: ${err.message}`);
    const extra = [];
    for (const btn of payload.interactiveButtons || []) {
      try {
        const params = JSON.parse(btn.buttonParamsJson || "{}");
        if (btn.name === "single_select") {
          for (const section of params.sections || []) {
            for (const row of section.rows || []) extra.push(`• ${row.title} — ${row.id}`);
          }
        } else extra.push(`• ${params.display_text} — ${params.id}`);
      } catch {
        /* abaikan tombol rusak */
      }
    }
    await send(client, jid, message, [payload.text, "", ...extra].join("\n"));
  }
};

const fetchGroups = async (client, force = false) => {
  if (!force && Date.now() - cache.at < CACHE_MS) return cache.map;

  let raw = {};
  try {
    raw = await client.groupFetchAllParticipating();
  } catch (err) {
    logger.warn(`group: fetch gagal: ${err.message}`);
  }

  const map = {};
  for (const [jid, group] of Object.entries(raw || {})) {
    if (!JID_RE.test(jid)) continue;
    map[jid] = { jid, name: group?.subject || "" };
  }

  cache = { at: Date.now(), map };
  return map;
};

const groupName = async (client, jid) => {
  try {
    const meta = await client.groupMetadata(jid);
    return meta?.subject || "";
  } catch {
    return "";
  }
};

const sisa = (rental) => (rental ? addbot.remaining(rental.until) : "tanpa masa sewa");

const listView = async (client, jid, message, page = 1, force = false) => {
  const map = await fetchGroups(client, force);
  const rentals = new Map(addbot.list().map((r) => [r.jid, r]));

  const groups = Object.values(map).sort(
    (a, b) => a.name.localeCompare(b.name, "id") || a.jid.localeCompare(b.jid)
  );

  if (!groups.length) {
    return send(client, jid, message, "❌ Bot tidak berada di grup mana pun (atau gagal ambil daftar grup).");
  }

  const totalPages = Math.max(1, Math.ceil(groups.length / PAGE));
  const current = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const slice = groups.slice((current - 1) * PAGE, current * PAGE);

  const text = [
    `📋 *DAFTAR GRUP* — ${groups.length} grup`,
    `Halaman ${current}/${totalPages}`,
    "",
    ...slice.map((g) => [`*${g.name || g.jid}*`, `  ${g.jid}`, `  ⏳ ${sisa(rentals.get(g.jid))}`].join("\n"))
  ].join("\n");

  const buttons = [
    {
      name: "single_select",
      buttonParamsJson: JSON.stringify({
        title: "Pilih Grup",
        sections: [
          {
            title: "Grup Bot",
            rows: slice.map((g) => ({
              id: `group ${g.jid}`,
              title: clip(g.name || g.jid, 24),
              description: clip(`${g.jid} • ${sisa(rentals.get(g.jid))}`, 72)
            }))
          }
        ]
      })
    }
  ];

  if (current < totalPages) {
    buttons.push({
      name: "quick_reply",
      buttonParamsJson: JSON.stringify({ display_text: "Halaman Berikutnya", id: `group list ${current + 1}` })
    });
  }
  if (current > 1) {
    buttons.push({
      name: "quick_reply",
      buttonParamsJson: JSON.stringify({ display_text: "Halaman Sebelumnya", id: `group list ${current - 1}` })
    });
  }

  return sendButtons(client, jid, message, { text, interactiveButtons: buttons });
};

const detailView = async (client, sender, message, jid) => {
  const rental = addbot.get(jid);
  const name = (await groupName(client, jid)) || rental?.name || jid;

  const text = [
    "📁 *DETAIL GRUP*",
    "",
    `Nama    : ${name}`,
    `ID      : ${jid}`,
    `Pembeli : ${rental?.buyer || "-"}`,
    `Paket   : ${rental?.plan || "-"}`,
    `Sisa    : ${sisa(rental)}`,
    `Sampai  : ${rental ? addbot.fmtUntil(rental.until) : "-"}`,
    "",
    `Salin: .group ${jid} add 7`
  ].join("\n");

  const buttons = [
    { name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text: "➕ Tambah Durasi", id: `group ${jid} add` }) },
    { name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text: "🚪 Keluar Grup", id: `group ${jid} leave` }) },
    { name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text: "↩️ Kembali", id: "group" }) }
  ];

  return sendButtons(client, sender, message, { text, interactiveButtons: buttons });
};

const addView = async (client, sender, message, jid) => {
  const rental = addbot.get(jid);
  const pkgs = config.addbotPackages || {};

  const rows = Object.entries(pkgs).map(([, pkg]) => ({
    id: `group ${jid} add ${pkg.days}`,
    title: pkg.label,
    description: `${pkg.days} hari`
  }));
  rows.push({ id: `group ${jid} add custom`, title: "Custom", description: "Isi jumlah hari sendiri" });

  const text = [
    "⏳ *TAMBAH DURASI*",
    "",
    `Grup  : ${rental?.name || jid}`,
    `Sisa  : ${sisa(rental)}`,
    "",
    "Pilih durasi:"
  ].join("\n");

  return sendButtons(client, sender, message, {
    text,
    interactiveButtons: [
      { name: "single_select", buttonParamsJson: JSON.stringify({ title: "Pilih Durasi", sections: [{ title: "Durasi", rows }] }) }
    ]
  });
};

const addDuration = async (client, sender, message, jid, rawDays) => {
  const cleaned = String(rawDays ?? "").trim();
  if (!/^\d+$/.test(cleaned)) {
    return send(client, sender, message, "❌ Jumlah hari tidak valid. Contoh: .group <jid> add 7 (0 = Selamanya)");
  }
  const days = Number(cleaned);

  const rec = addbot.extend(jid, days);
  logger.cmd(`group: extend ${jid} ${days} hari -> ${addbot.fmtUntil(rec.until)}`);

  return send(
    client,
    sender,
    message,
    [
      "✅ *DURASI DITAMBAH*",
      "",
      `Grup   : ${rec.name || jid}`,
      `ID     : ${jid}`,
      `Tambah : ${days === 0 ? "Selamanya" : `${days} hari`}`,
      `Sisa   : ${addbot.remaining(rec.until)}`,
      `Sampai : ${addbot.fmtUntil(rec.until)}`
    ].join("\n")
  );
};

const leaveGroup = async (client, sender, message, jid, confirm) => {
  const rental = addbot.get(jid);
  const name = rental?.name || jid;

  if (confirm !== "yes") {
    return sendButtons(client, sender, message, {
      text: [
        "⚠️ *KONFIRMASI KELUAR GRUP*",
        "",
        "Bot akan keluar dari grup:",
        `Nama : ${name}`,
        `ID   : ${jid}`,
        "",
        "Tindakan ini tidak bisa dibatalkan."
      ].join("\n"),
      interactiveButtons: [
        { name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text: "Ya, keluar", id: `group ${jid} leave yes` }) },
        { name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text: "Batal", id: `group ${jid}` }) }
      ]
    });
  }

  let ok = false;
  let errText = "";
  try {
    await client.groupLeave(jid);
    ok = true;
  } catch (err) {
    errText = err.message;
  }

  if (ok) {
    addbot.remove(jid);
    cache.at = 0;
  }

  logger.cmd(`group: leave ${jid} ${ok ? "ok" : errText}`);

  return send(
    client,
    sender,
    message,
    ok ? `✅ Bot keluar dari ${name}\n${jid}` : `❌ Gagal keluar dari ${name}: ${errText}`
  );
};

const joinGroup = async (client, sender, message, input, rawDays) => {
  const code = parseCode(input);
  if (!code) return send(client, sender, message, "❌ Link/kode undangan grup tidak valid.");

  let jid = null;
  try {
    jid = await client.groupAcceptInvite(code);
  } catch (err) {
    return send(client, sender, message, `❌ Gagal join grup: ${err.message}`);
  }
  if (!jid) return send(client, sender, message, "❌ Link undangan tidak valid / sudah kedaluwarsa.");

  const name = await groupName(client, jid);
  let extra = "";
  if (rawDays !== undefined) {
    const cleaned = String(rawDays ?? "").trim();
    if (/^\d+$/.test(cleaned)) {
      const rec = addbot.extend(jid, cleaned, { name, buyer: "owner" });
      extra = `\nSewa   : ${addbot.remaining(rec.until)}\nSampai : ${addbot.fmtUntil(rec.until)}`;
    }
  }

  cache.at = 0;
  logger.cmd(`group: join ${jid}${extra ? " (+sewa)" : ""}`);

  return send(client, sender, message, ["✅ *BOT JOIN GRUP*", "", `Nama : ${name || "-"}`, `ID   : ${jid}${extra}`].join("\n"));
};

const execute = async (client, message, args) => {
  const sender = message.key.remoteJid;
  const p = getPrefix(message);

  if (!isOwner(message)) {
    return await send(client, sender, message, "❌ Command ini khusus owner.");
  }

  const a = (args || []).map((v) => String(v));
  const sub = (a[0] || "").toLowerCase();

  try {
    if (!sub) return await listView(client, sender, message, 1);
    if (sub === "list") return await listView(client, sender, message, a[1] || 1);
    if (sub === "refresh" || sub === "sync") return await listView(client, sender, message, 1, true);

    if (sub === "join") {
      if (!a[1]) {
        return await send(
          client,
          sender,
          message,
          [
            "🔗 *JOIN GRUP*",
            "",
            "Format:",
            `${p}group join <link undangan> [hari]`,
            "",
            "Contoh:",
            `${p}group join https://chat.whatsapp.com/XXXXXXXXXXXX 30`
          ].join("\n")
        );
      }
      return await joinGroup(client, sender, message, a[1], a[2]);
    }

    const jid = a[0];
    if (!JID_RE.test(jid)) {
      return await send(client, sender, message, `❌ ID grup tidak valid.\n\nLihat daftar: *${p}group*`);
    }

    const action = (a[1] || "").toLowerCase();
    if (!action) return await detailView(client, sender, message, jid);

    if (action === "add") {
      if (a[2] === undefined) return await addView(client, sender, message, jid);
      if (String(a[2]).toLowerCase() === "custom") {
        return await send(
          client,
          sender,
          message,
          [
            "✏️ *CUSTOM DURASI*",
            "",
            "Kirim:",
            `${p}group ${jid} add <hari>`,
            "",
            `Contoh: ${p}group ${jid} add 14`,
            "Kirim 0 untuk Selamanya."
          ].join("\n")
        );
      }
      return await addDuration(client, sender, message, jid, a[2]);
    }

    if (action === "leave") {
      return await leaveGroup(client, sender, message, jid, (a[2] || "").toLowerCase());
    }

    return await detailView(client, sender, message, jid);
  } catch (err) {
    logger.error(`group: ${err.message}`);
    return await send(client, sender, message, `❌ Error: ${err.message}`);
  }
};

module.exports = {
  name: "group",
  command: ["group", "groups", "grup", "glist"],
  category: "owner",
  description: "Kelola grup bot: daftar, masa sewa, tambah durasi, keluar, join (owner)",
  visible: false,
  execute
};
