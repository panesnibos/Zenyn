const todayKey = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const templates = [
  { type: "battle", label: "Lakukan 5 battle", target: 5, gold: 300, exp: 50 },
  { type: "kill", label: "Kalahkan 10 monster", target: 10, gold: 400, exp: 70 },
  { type: "heal", label: "Gunakan 2 item heal", target: 2, gold: 200, exp: 30 },
  { type: "buy", label: "Beli 3 item di shop", target: 3, gold: 250, exp: 40 },
  { type: "sell", label: "Jual 3 item", target: 3, gold: 250, exp: 40 },
  { type: "gather", label: "Gather 5 material", target: 5, gold: 300, exp: 50 },
  { type: "craft", label: "Craft 1 item", target: 1, gold: 300, exp: 50 },
  { type: "duel", label: "Menangkan 1 duel", target: 1, gold: 500, exp: 80 },
  { type: "dungeon", label: "Selesaikan 1 floor dungeon", target: 1, gold: 400, exp: 70 },
  { type: "raid", label: "Serang raid boss 3x", target: 3, gold: 400, exp: 70 },
  { type: "pet", label: "Latih pet 2x", target: 2, gold: 300, exp: 50 }
];

const pickDaily = () => {
  const pool = [...templates];
  const chosen = [];
  while (chosen.length < 3 && pool.length) {
    const idx = Math.floor(Math.random() * pool.length);
    const t = pool.splice(idx, 1)[0];
    chosen.push({
      type: t.type,
      label: t.label,
      target: t.target,
      progress: 0,
      claimed: false,
      gold: t.gold,
      exp: t.exp
    });
  }
  return chosen;
};

module.exports = { todayKey, templates, pickDaily };
