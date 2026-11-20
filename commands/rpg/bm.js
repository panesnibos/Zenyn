// commands/rpg/bm.js — Black Market pribadi: 10 unit per sesi, kuota 7 item/hari.
// Format: .bm | .bm pribadi | .bm super | .bm beli <nomor> [qty]
const { db } = require("../../lib/rpgdb");
const { getUserId } = require("../../lib/rpgutil");
const { getPrefix } = require("../../lib/prefix");
const { guarded } = require("../../lib/featureutil");
const bm = require("../../lib/blackmarket");
const { short } = require("../../lib/num");

const rp = (n) => short(n || 0);
const GROUP_LABEL = { kunci: "🔑 Kunci", bahan: "🧱 Bahan gelap", rotasi: "🎲 Rotasi" };

const statusLine = (win, now) =>
  win.open
    ? `🟢 Buka — tutup dalam ${bm.leftText(win.endsAt - now)}`
    : `🔴 Tutup — buka dalam ${bm.leftText(win.endsAt - now)}`;

const showPrivate = (client, message, p, userId, now) => {
  const { stock, open, endsAt } = bm.current(now);
  const quota = bm.quotaOf(userId, now);

  const lines = [
    "🕶️ *BLACK MARKET*",
    "",
    statusLine({ open, endsAt }, now),
    `🎟️ Kuota hari ini: ${quota.bought}/${quota.max} item`
  ];

  if (!open) {
    lines.push("", "Daftar stok muncul saat pasar buka.");
  } else {
    let lastGroup = null;
    stock.forEach((s, i) => {
      if (s.group !== lastGroup) {
        lines.push("", GROUP_LABEL[s.group] || "📦 Stok");
        lastGroup = s.group;
      }
      const left = bm.remainingOf(s, quota.taken);
      const tag = left <= 0 ? "HABIS" : `sisa ${left}`;
      lines.push(`${i + 1}. ${s.promo ? "🔥 " : ""}${s.emoji || "📦"} ${s.name} — ${rp(s.price)} (${tag})`);
    });
    lines.push("", `Stok sesi ini: ${bm.TOTAL_UNITS} unit`, `Beli: *${p}bm beli <nomor> [qty]*`);
  }

  return client.sendMessage(message.key.remoteJid, { text: lines.join("\n") }, { quoted: message });
};

const showMenu = (client, message, now) => {
  const win = bm.windowOf(now);

  const text = [
    "🕶️ *BLACK MARKET*",
    "",
    statusLine(win, now),
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
            title: "Black Market",
            sections: [
              {
                title: "Pilih Pasar",
                rows: [
                  { id: "bm super", title: "🌍 Super Black Market", description: "Stok bareng semua pemain (belum dibuka)" },
                  { id: "bm pribadi", title: "🕶️ Black Market", description: "Jatah stok kamu sendiri" }
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

  if (action === "global" || action === "super") {
    return client.sendMessage(
      sender,
      {
        text: `🌍 *SUPER BLACK MARKET*\n\nStok bareng semua pemain belum dibuka.\nSementara pakai *${p}bm pribadi* (Black Market).`
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

  if (action === "pribadi" || action === "saya" || action === "lokal" || action === "market") {
    return showPrivate(client, message, p, userId, now);
  }

  if (action) {
    return client.sendMessage(
      sender,
      { text: `🕶️ Format: *${p}bm*, *${p}bm pribadi*, *${p}bm super*, *${p}bm beli <nomor> [qty]*` },
      { quoted: message }
    );
  }

  return showMenu(client, message, now);
};

module.exports = {
  name: "bm",
  command: ["bm", "blackmarket"],
  category: "rpg",
  visible: true,
  description: "Black Market: kunci & bahan langka, buka 06:00-12:00 & 18:00-00:00 WIB",
  subcommands: ["pribadi", "super", "beli <nomor> [qty]"],
  execute: guarded("bm", execute)
};
