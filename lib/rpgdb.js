const logger = require("./logger");
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { readJson } = require("./rpgjson");
const { pickDaily, todayKey } = require("./rpgquests");
const { achievements } = require("./rpgachievements");
const { statsOf } = require("./rpgcombat");
const { RESET_AMOUNT } = require("./rpglimit");

const DB_PATH =
  process.env.DB_PATH || path.join(__dirname, "../database/rpg/zenyn.db");
const LEVEL_PATH = path.join(__dirname, "../database/rpg/levelup.json");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const sql = new Database(DB_PATH);
sql.pragma("journal_mode = WAL");
sql.pragma("synchronous = NORMAL");
sql.pragma("busy_timeout = 5000");
sql.exec(
  "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, data TEXT NOT NULL)"
);

let levelRewards = [];
try {
  levelRewards = readJson(LEVEL_PATH, []);
} catch {
  logger.warn("❌ levelup.json error");
}

const stmtOne = sql.prepare("SELECT data FROM users WHERE id = ?");
const stmtAll = sql.prepare("SELECT data FROM users");
const stmtUpsert = sql.prepare(
  "INSERT INTO users (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data"
);
const stmtDelete = sql.prepare("DELETE FROM users WHERE id = ?");

const parseRow = (row) => {
  try {
    return JSON.parse(row.data);
  } catch {
    return null;
  }
};

let cache = null;

const loadAll = () => {
  if (cache) return cache;
  const data = {};
  for (const row of stmtAll.all()) {
    const user = parseRow(row);
    if (user && user.id !== undefined) data[user.id] = user;
  }
  cache = data;
  return cache;
};

const load = () => loadAll();

const save = (data) => {
  cache = data;
  sql.transaction((rows) => {
    const seen = new Set();
    for (const user of Object.values(rows)) {
      if (!user || user.id === undefined) continue;
      seen.add(String(user.id));
      stmtUpsert.run(user.id, JSON.stringify(user));
    }
    for (const row of stmtAll.all()) {
      const existing = parseRow(row);
      if (!existing || existing.id === undefined) continue;
      if (!seen.has(String(existing.id))) stmtDelete.run(existing.id);
    }
  })(data);
};

const defaultUser = (id, name) => ({
  id,
  name,
  registered: false,
  ageGroup: null,
  registeredAt: null,
  level: 1,
  exp: 0,
  expNeeded: 100,
  money: 500,
  limit: RESET_AMOUNT,
  limitMax: RESET_AMOUNT,
  limitDate: null,
  status: { type: "User", until: null },
  hp: 100,
  maxHp: 100,
  atk: 10,
  def: 5,
  inventory: [],
  daily: null,
  lastBattle: 0,
  lastDeath: 0,
  lastSkill: 0,
  lastGather: 0,
  lastRaid: 0,
  lastDuel: 0,
  lastDungeon: 0,
  lastTrain: 0,
  createdAt: Date.now(),
  equipment: { weapon: null, armor: null, accessory: null },
  enhance: { weapon: 0, armor: 0, accessory: 0 },
  title: null,
  prestige: 0,
  pet: null,
  quests: { date: null, list: [] },
  pvp: { rating: 1000, wins: 0, losses: 0 },
  achievements: [],
  stats: {
    battles: 0,
    kills: 0,
    deaths: 0,
    goldEarned: 0,
    itemsSold: 0,
    itemsBought: 0,
    gathered: 0,
    crafted: 0,
    duelsWon: 0,
    duelsLost: 0,
    raidDamage: 0,
    dungeonFloor: 1,
    dungeonBest: 1
  }
});

const ensureDefaults = (user) => {
  const base = defaultUser(user.id, user.name);
  let changed = false;

  for (const [key, value] of Object.entries(base)) {
    if (user[key] === undefined) {
      user[key] = value;
      changed = true;
    }
  }

  if (!user.equipment || typeof user.equipment !== "object") {
    user.equipment = { ...base.equipment };
    changed = true;
  }
  for (const [key, value] of Object.entries(base.equipment)) {
    if (user.equipment[key] === undefined) {
      user.equipment[key] = value;
      changed = true;
    }
  }

  if (!user.enhance || typeof user.enhance !== "object") {
    user.enhance = { ...base.enhance };
    changed = true;
  }
  for (const [key, value] of Object.entries(base.enhance)) {
    if (user.enhance[key] === undefined) {
      user.enhance[key] = value;
      changed = true;
    }
  }

  if (!user.stats || typeof user.stats !== "object") {
    user.stats = { ...base.stats };
    changed = true;
  }
  for (const [key, value] of Object.entries(base.stats)) {
    if (user.stats[key] === undefined) {
      user.stats[key] = value;
      changed = true;
    }
  }

  if (!user.pvp || typeof user.pvp !== "object") {
    user.pvp = { ...base.pvp };
    changed = true;
  }
  for (const [key, value] of Object.entries(base.pvp)) {
    if (user.pvp[key] === undefined) {
      user.pvp[key] = value;
      changed = true;
    }
  }

  if (!user.status || typeof user.status !== "object") {
    user.status = { type: "User", until: null };
    changed = true;
  }

  if (user.limitMax === undefined) {
    user.limitMax = RESET_AMOUNT;
    changed = true;
  }

  const today = todayKey();
  if (user.limitDate !== today) {
    user.limit = user.limitMax;
    user.limitDate = today;
    changed = true;
  }

  if (!user.quests || typeof user.quests !== "object") {
    user.quests = { date: null, list: [] };
    changed = true;
  }

  return changed;
};

const expNeeded = (level) => Math.floor(100 * Math.pow(1.5, level - 1));

const ensureQuests = (user) => {
  const today = todayKey();
  if (!user.quests || user.quests.date !== today || !Array.isArray(user.quests.list) || !user.quests.list.length) {
    user.quests = { date: today, list: pickDaily() };
    return true;
  }
  return false;
};

const db = {
  getUser(id, name = "Player") {
    const data = load();
    let changed = false;

    if (!data[id]) {
      data[id] = defaultUser(id, name);
      changed = true;
    } else if (ensureDefaults(data[id])) {
      changed = true;
    }

    if (changed) save(data);
    return data[id];
  },

  saveUser(user) {
    const data = load();
    ensureDefaults(user);
    data[user.id] = user;
    save(data);
  },

  updateUser(id, fn) {
    const data = load();
    const user = data[id];
    if (!user) return null;
    ensureDefaults(user);
    fn(user);
    save(data);
    return user;
  },

  mergeUsers(fromId, toId) {
    if (!fromId || !toId || fromId === toId) return false;

    const data = load();
    const from = data[fromId];
    if (!from) return false;

    ensureDefaults(from);

    if (!data[toId]) {
      from.id = toId;
      data[toId] = from;
      delete data[fromId];
      save(data);
      return true;
    }

    const to = data[toId];
    ensureDefaults(to);

    to.level = Math.max(to.level, from.level);
    to.exp = Math.max(to.exp, from.exp);
    to.expNeeded = expNeeded(to.level);
    to.money = Math.max(to.money, from.money);
    to.maxHp = Math.max(to.maxHp, from.maxHp);
    to.atk = Math.max(to.atk, from.atk);
    to.def = Math.max(to.def, from.def);
    to.hp = Math.min(to.maxHp, Math.max(to.hp, from.hp));

    for (const key of Object.keys(to.stats)) {
      if (typeof from.stats[key] === "number") {
        to.stats[key] = Math.max(to.stats[key], from.stats[key]);
      }
    }

    to.pvp.rating = Math.max(to.pvp.rating, from.pvp.rating);
    to.pvp.wins = Math.max(to.pvp.wins, from.pvp.wins);
    to.pvp.losses = Math.max(to.pvp.losses, from.pvp.losses);

    const inventory = new Map();
    for (const item of [...to.inventory, ...from.inventory]) {
      const key = String(item.name).toLowerCase();
      const existing = inventory.get(key);
      if (existing) {
        existing.qty = Math.max(existing.qty, item.qty);
      } else {
        inventory.set(key, { ...item });
      }
    }
    to.inventory = Array.from(inventory.values());

    for (const slot of ["weapon", "armor", "accessory"]) {
      to.equipment[slot] = to.equipment[slot] || from.equipment[slot];
      to.enhance[slot] = Math.max(to.enhance[slot] || 0, from.enhance[slot] || 0);
    }

    to.title = to.title || from.title;
    to.prestige = Math.max(to.prestige, from.prestige);
    if (!to.pet || (from.pet && from.pet.level > to.pet.level)) to.pet = from.pet;

    to.achievements = Array.from(new Set([...(to.achievements || []), ...(from.achievements || [])]));

    to.quests = to.quests?.list?.length ? to.quests : from.quests;
    to.daily = to.daily || from.daily;

    for (const key of ["lastBattle", "lastDeath", "lastSkill", "lastGather", "lastRaid", "lastDuel", "lastDungeon", "lastTrain"]) {
      to[key] = Math.max(to[key] || 0, from[key] || 0);
    }
    to.createdAt = Math.min(to.createdAt || Date.now(), from.createdAt || Date.now());

    if (to.name === "Player" && from.name && from.name !== "Player") to.name = from.name;
    if (!to.registered && from.registered) {
      to.registered = true;
      to.ageGroup = to.ageGroup || from.ageGroup || null;
      to.registeredAt = to.registeredAt || from.registeredAt || null;
    }

    delete data[fromId];
    save(data);
    return true;
  },

  addExp(id, amount) {
    const data = load();
    if (!data[id]) return null;

    const user = data[id];
    ensureDefaults(user);
    user.exp += amount;

    let levelUp = 0;
    let rewards = [];

    while (user.exp >= user.expNeeded) {
      user.exp -= user.expNeeded;
      user.level++;
      user.expNeeded = expNeeded(user.level);

      user.maxHp += 10;
      user.atk += 2;
      user.def += 1;

      levelUp++;

      let reward = levelRewards.find(
        (r) => user.level >= r.min && user.level <= r.max
      );

      if (!reward && levelRewards.length > 0) {
        reward = levelRewards[levelRewards.length - 1];
      }

      if (reward) {
        if (reward.gold) {
          user.money += reward.gold;
        }

        if (Array.isArray(reward.items)) {
          reward.items.forEach((item) => {
            const existing = user.inventory.find((i) => i.name === item.name);
            if (existing) {
              existing.qty += item.qty || 1;
            } else {
              user.inventory.push({
                name: item.name,
                emoji: item.emoji || "📦",
                qty: item.qty || 1,
              });
            }
          });
        }

        rewards.push(reward);
      }
    }

    save(data);

    return {
      levelUp: levelUp > 0,
      total: levelUp,
      rewards,
    };
  },

  addMoney(id, amount) {
    const data = load();
    if (!data[id]) return null;
    ensureDefaults(data[id]);
    data[id].money = Math.max(0, data[id].money + amount);
    if (amount > 0) data[id].stats.goldEarned += amount;
    save(data);
    return data[id].money;
  },

  addLimit(id, amount) {
    const data = load();
    if (!data[id]) return null;
    ensureDefaults(data[id]);
    const max = data[id].limitMax ?? RESET_AMOUNT;
    data[id].limit = Math.max(0, Math.min(max, (data[id].limit ?? 0) + amount));
    save(data);
    return data[id].limit;
  },

  setLimit(id, amount) {
    const data = load();
    if (!data[id]) return null;
    ensureDefaults(data[id]);
    const max = data[id].limitMax ?? RESET_AMOUNT;
    data[id].limit = Math.max(0, Math.min(max, amount));
    save(data);
    return data[id].limit;
  },

  setStatus(id, type, until = null) {
    const data = load();
    if (!data[id]) return null;
    ensureDefaults(data[id]);
    const valid = ["User", "Premium", "Donatur"];
    const t = valid.includes(type) ? type : "User";
    data[id].status = { type: t, until: t === "User" ? null : until };
    save(data);
    return data[id].status;
  },

  setHp(id, amount) {
    const data = load();
    if (!data[id]) return null;
    ensureDefaults(data[id]);
    const maxHp = statsOf(data[id]).maxHp;
    data[id].hp = Math.min(maxHp, Math.max(0, amount));
    save(data);
    return data[id].hp;
  },

  addLevel(id, amount) {
    const data = load();
    if (!data[id]) return null;

    const user = data[id];
    ensureDefaults(user);
    const n = parseInt(amount) || 0;
    user.level = Math.max(1, user.level + n);
    user.expNeeded = expNeeded(user.level);
    user.maxHp = 100 + (user.level - 1) * 10;
    user.atk = 10 + (user.level - 1) * 2;
    user.def = 5 + (user.level - 1);
    if (user.hp > user.maxHp) user.hp = user.maxHp;

    save(data);
    return user;
  },

  resetUser(id, name = "Player") {
    const data = load();
    data[id] = defaultUser(id, name);
    save(data);
    return data[id];
  },

  addItem(id, item) {
    const data = load();
    if (!data[id]) return null;

    const user = data[id];
    ensureDefaults(user);
    const existing = user.inventory.find((i) => i.name === item.name);

    if (existing) {
      existing.qty += item.qty || 1;
    } else {
      user.inventory.push({
        name: item.name,
        emoji: item.emoji || "📦",
        qty: item.qty || 1,
      });
    }

    save(data);
  },

  removeItem(id, itemName, qty = 1) {
    const data = load();
    if (!data[id]) return false;

    const user = data[id];
    ensureDefaults(user);
    const index = user.inventory.findIndex(
      (i) => i.name.toLowerCase() === String(itemName).toLowerCase()
    );
    if (index === -1) return false;
    if (user.inventory[index].qty < qty) return false;

    user.inventory[index].qty -= qty;
    if (user.inventory[index].qty <= 0) {
      user.inventory.splice(index, 1);
    }

    save(data);
    return true;
  },

  hasItem(id, itemName, qty = 1) {
    const user = load()[id];
    if (!user) return false;
    const item = user.inventory.find(
      (i) => i.name.toLowerCase() === String(itemName).toLowerCase()
    );
    return !!item && item.qty >= qty;
  },

  canDaily(id) {
    const data = load();
    const user = data[id];
    if (!user?.daily) return true;
    return Date.now() - user.daily >= 24 * 60 * 60 * 1000;
  },

  setDaily(id) {
    const data = load();
    if (!data[id]) return false;
    data[id].daily = Date.now();
    save(data);
    return true;
  },

  getStats(user) {
    return statsOf(user);
  },

  addStat(id, key, amount = 1) {
    const data = load();
    if (!data[id]) return null;
    ensureDefaults(data[id]);
    data[id].stats[key] = (data[id].stats[key] || 0) + amount;
    save(data);
    return data[id].stats[key];
  },

  getQuests(id) {
    const data = load();
    const user = data[id];
    if (!user) return [];
    ensureDefaults(user);
    if (ensureQuests(user)) save(data);
    return user.quests.list;
  },

  addQuestProgress(id, type, amount = 1) {
    const data = load();
    const user = data[id];
    if (!user) return [];
    ensureDefaults(user);
    let changed = ensureQuests(user);
    const completed = [];

    for (const quest of user.quests.list) {
      if (quest.type !== type || quest.claimed) continue;
      if (quest.progress >= quest.target) continue;
      quest.progress = Math.min(quest.target, quest.progress + amount);
      changed = true;
      if (quest.progress >= quest.target) completed.push(quest);
    }

    if (changed) save(data);
    return completed;
  },

  claimQuest(id, index) {
    const data = load();
    const user = data[id];
    if (!user) return { ok: false, reason: "User tidak ditemukan" };
    ensureDefaults(user);
    ensureQuests(user);

    const quest = user.quests.list[index];
    if (!quest) return { ok: false, reason: "Quest tidak ditemukan" };
    if (quest.claimed) return { ok: false, reason: "Quest sudah diklaim" };
    if (quest.progress < quest.target) return { ok: false, reason: "Quest belum selesai" };

    quest.claimed = true;
    save(data);

    db.addMoney(id, quest.gold);
    const expResult = db.addExp(id, quest.exp);
    return { ok: true, quest, expResult };
  },

  checkAchievements(id) {
    const data = load();
    const user = data[id];
    if (!user) return [];
    ensureDefaults(user);

    if (!Array.isArray(user.achievements)) user.achievements = [];
    const unlocked = [];
    for (const ach of achievements) {
      if (user.achievements.includes(ach.id)) continue;
      if (ach.check(user)) {
        user.achievements.push(ach.id);
        unlocked.push(ach);
      }
    }

    if (unlocked.length) save(data);
    return unlocked;
  },

  setTitle(id, title) {
    const data = load();
    const user = data[id];
    if (!user) return { ok: false, reason: "User tidak ditemukan" };
    ensureDefaults(user);

    if (!title || title.toLowerCase() === "none" || title.toLowerCase() === "reset") {
      user.title = null;
      save(data);
      return { ok: true, title: null };
    }

    const ach = achievements.find(
      (a) => a.title && a.title.toLowerCase() === title.toLowerCase()
    );
    if (!ach) return { ok: false, reason: "Title tidak ditemukan" };
    if (!user.achievements.includes(ach.id)) return { ok: false, reason: "Achievement belum terbuka" };

    user.title = ach.title;
    save(data);
    return { ok: true, title: ach.title };
  },

  leaderboard(limit = 10) {
    const data = load();
    return Object.values(data)
      .sort(
        (a, b) =>
          (b.prestige || 0) - (a.prestige || 0) ||
          b.level - a.level ||
          b.exp - a.exp ||
          b.money - a.money
      )
      .slice(0, limit);
  },

  all() {
    return load();
  },
};

module.exports = { db };
