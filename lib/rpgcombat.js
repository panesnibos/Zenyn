const { findItemDef, equipmentByRarity } = require("./rpgitems");

const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const scaledStat = (base, level) => {
  if (!base) return 0;
  const step = Math.max(1, Math.round(base * 0.1));
  return base + step * (level || 0);
};

const equipmentStats = (name, level = 0) => {
  const item = findItemDef(name);
  if (!item) return null;

  return {
    name: item.name,
    emoji: item.emoji,
    slot: item.slot,
    rarity: item.rarity,
    atk: scaledStat(item.atk || 0, level),
    def: scaledStat(item.def || 0, level),
    hp: scaledStat(item.hp || 0, level),
    goldBonus: item.goldBonus || 0
  };
};

const statsOf = (user) => {
  let atk = user.atk || 10;
  let def = user.def || 5;
  let maxHp = user.maxHp || 100;
  let goldBonus = 0;

  const equipment = user.equipment || {};
  const enhance = user.enhance || {};
  const inventory = user.inventory || [];
  const owned = (name) => inventory.some((i) => String(i.name).toLowerCase() === String(name).toLowerCase() && i.qty > 0);

  for (const slot of ["weapon", "armor", "accessory"]) {
    const name = equipment[slot];
    if (!name) continue;
    if (!owned(name)) continue;
    const stats = equipmentStats(name, enhance[slot] || 0);
    if (!stats) continue;
    atk += stats.atk;
    def += stats.def;
    maxHp += stats.hp;
    goldBonus += stats.goldBonus;
  }

  if (user.pet) {
    const lv = user.pet.level || 1;
    atk += Math.floor(lv * 1.5);
    def += Math.floor(lv * 0.8);
    maxHp += lv * 3;
    goldBonus += Math.min(0.5, lv * 0.01);
  }

  const prestigeMult = 1 + (user.prestige || 0) * 0.05;
  atk = Math.floor(atk * prestigeMult);
  def = Math.floor(def * prestigeMult);
  maxHp = Math.floor(maxHp * prestigeMult);

  return { atk, def, maxHp, goldBonus };
};

const simulateFight = (player, enemy, mode = "attack", startHp) => {
  let hp = Math.max(1, Math.min(startHp ?? player.maxHp, player.maxHp));
  let ehp = enemy.hp;
  const maxEnemyHp = enemy.hp;
  const atk = mode === "skill" ? Math.floor(player.atk * 1.8) : player.atk;
  const def = mode === "defend" ? Math.floor(player.def * 2) : player.def;

  let rounds = 0;
  let dealt = 0;
  let missed = 0;

  while (hp > 0 && ehp > 0 && rounds < 40) {
    rounds++;

    const miss = mode === "skill" && Math.random() < 0.2;
    if (miss) {
      missed++;
    } else {
      const crit = Math.random() < 0.1 ? 1.5 : 1;
      const dmg = Math.max(1, Math.floor((atk - (enemy.def || 0) + randInt(0, 4)) * crit));
      ehp -= dmg;
      dealt += dmg;
    }

    if (ehp <= 0) break;

    let edmg = Math.max(1, (enemy.atk || 1) - def + randInt(0, 4));
    if (mode === "defend") edmg = Math.max(1, Math.floor(edmg * 0.5));
    hp -= edmg;
  }

  return {
    hp: Math.max(0, hp),
    enemyHp: Math.max(0, ehp),
    maxEnemyHp,
    win: ehp <= 0,
    rounds,
    dealt,
    missed
  };
};

const simulatePvP = (a, b) => {
  let ah = a.maxHp;
  let bh = b.maxHp;

  for (let round = 0; round < 60 && ah > 0 && bh > 0; round++) {
    const aCrit = Math.random() < 0.1 ? 1.5 : 1;
    const bCrit = Math.random() < 0.1 ? 1.5 : 1;

    bh -= Math.max(1, Math.floor((a.atk - b.def + randInt(0, 5)) * aCrit));
    if (bh <= 0) break;

    ah -= Math.max(1, Math.floor((b.atk - a.def + randInt(0, 5)) * bCrit));
  }

  return {
    winner: bh <= 0 ? 0 : ah <= 0 ? 1 : ah >= bh ? 0 : 1,
    aHp: Math.max(0, ah),
    bHp: Math.max(0, bh)
  };
};

const equipmentDrop = (rarity) => {
  const pool = equipmentByRarity(rarity);
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
};

const difficultyEnemy = (level) => ({
  name: `Floor Boss Lv.${level}`,
  emoji: "👹",
  level,
  hp: Math.floor(80 + level * 45),
  atk: Math.floor(15 + level * 4),
  def: Math.floor(4 + level * 2)
});

module.exports = { randInt, statsOf, simulateFight, simulatePvP, difficultyEnemy, equipmentDrop };
