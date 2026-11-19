// commands/rpg/bm.js — pasar gelap: menu global/pribadi, kuota harian.
// Format: .bm | .bm pribadi | .bm global | .bm beli <nomor> [qty]
const { db } = require("../../lib/rpgdb");
const { getUserId } = require("../../lib/rpgutil");
const { getPrefix } = require("../../lib/prefix");
const { guarded } = require("../../lib/featureutil");
const bm = require("../../lib/blackmarket");
const { short } = require("../../lib/num");

const rp = (n) => short(n || 0);

const statusLine = (win, now) =>
  win.open
    ? `🟢 Buka — tutup dalam ${bm.leftText(win.endsAt - now)}`
    : `🔴 Tutup — buka dalam ${bm.leftText(win.endsAt - now)}`;

const showPrivate = (client, message, p, userId, now) => {
  const { stock, open, endsAt } = bm.current(now);
  const quota = bm.quotaOf(userId, now);

  const lines = [
    "🕶️ *PASAR GELAP PRIBADI*",
    "",
    statusLine({ open, endsAt }, now),
    `🎟️ Kuota hari ini: ${quota.bought}/${quota.max} item`
  ];

  if (!open) {
    lines.push("", "Daftar stok muncul saat pasar buka.");
  } else {
    stock.forEach((s, i) => {
      const left = bm.remainingOf(s, quota.taken);
      const tag = left <= 0 ? "HABIS" : `sisa ${left}`;
      lines.push(`${i + 1}. ${s.emoji || "📦"} ${s.name}${s.rare ? " ✨" : ""} — ${rp(s.price)} gold (${tag})`);
    });
    lines.push("", `Beli: *${p}bm beli <nomor> [qty]*`);
  }

  return client.sendMessage(message.key.remoteJid, { text: lines.join("\n") }, { quoted: message });
};

const showMenu = (client, message, userId, now) => {
  const win = bm.windowOf(now);
  const quota = bm.quotaOf(userId, now);

  const text = [
    "🕶️ *PASAR GELAP*",
    "",
    statusLine(win, now),
    `🎟️ Kuota hari ini: ${quota.bought}/${quota.max} item`,
    "",
    "Pilih pasar:"
  ].join("\n");

  return client.sendInteractiveMessage(
    message.key.remoteJid,
    {
      text,
      interactiveButtons: [
        {
          name: "single_select",
          buttonParamsJson: JSON.stringify({
            title: "Pasar Gelap",
            sections: [
              {
                title: "Pilih Pasar",
                rows: [
                  { id: "bm global", title: "🌍 Pasar Gelap Global", description: "Stok bareng semua pemain (belum dibuka)" },
                  { id: "bm pribadi", title: "👤 Pasar Gelap Pribadi", description: "Jatah stok kamu sendiri" }
                ]
              }
            ]
          })
        }
      ]
    },
    { quoted: message }
  );
};

const execute = async (client, message, args) => {
  const sender = message.key.remoteJid;
  const userId = getUserId(message);
  const p = getPrefix(message);
  if (!userId) throw new Error("Tidak bisa mengenali pengirim.");

  const action = String(args[0] || "").toLowerCase();
  const now = Date.now();

  if (action === "global") {
    return client.sendMessage(
      sender,
      {
        text: `🌍 *PASAR GELAP GLOBAL*\n\nStok bareng semua pemain belum dibuka.\nSementara pakai *${p}bm pribadi*.`
      },
      { quoted: message }
    );
  }

  if (action === "beli" || action === "buy") {
    const out = bm.buy(userId, args[1], args[2], now);
    const quota = bm.quotaOf(userId, now);
    return client.sendMessage(
      sender,
      {
        text: [
          `✅ Beli ${out.entry.emoji || "📦"} ${out.entry.name} x${out.qty}`,
          `💸 ${rp(out.total)} gold`,
          `🎟️ Kuota hari ini: ${quota.bought}/${quota.max}`,
          `💳 Sisa gold: ${rp(db.getUser(userId).money)}`
        ].join("\n")
      },
      { quoted: message }
    );
  }

  if (action === "pribadi" || action === "saya" || action === "lokal") {
    return showPrivate(client, message, p, userId, now);
  }

  if (action) {
    return client.sendMessage(
      sender,
      { text: `🕶️ Format: *${p}bm*, *${p}bm pribadi*, *${p}bm global*, *${p}bm beli <nomor> [qty]*` },
      { quoted: message }
    );
  }

  return showMenu(client, message, userId, now);
};

module.exports = {
  name: "bm",
  command: ["bm", "blackmarket"],
  category: "rpg",
  visible: true,
  description: "Pasar gelap: kunci & bahan langka, buka 06:00-12:00 & 18:00-00:00 WIB",
  subcommands: ["pribadi", "global", "beli <nomor> [qty]"],
  execute: guarded("bm", execute)
};
