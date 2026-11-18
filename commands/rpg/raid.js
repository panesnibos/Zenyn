// commands/rpg/raid.js — raid boss per grup + world boss global (.raid join).
// Serangan dibalas boss; pemain yang tumbang tidak bisa menyerang 60 detik.
const logger = require("../../lib/logger");
const path = require("path");
const { db } = require("../../lib/rpgdb");
const { getUserId, makeBar } = require("../../lib/rpgutil");
const { randInt, equipmentDrop } = require("../../lib/rpgcombat");
const { readJson, writeJson } = require("../../lib/rpgjson");
const { guarded } = require("../../lib/featureutil");

const FILE = process.env.RAID_FILE || path.join(__dirname, "../../database/rpg/raid.json");
const envNum = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const ATTACK_CD = envNum(process.env.RAID_ATTACK_CD_MS, 2000);
const GROUP_RESPAWN = envNum(process.env.RAID_RESPAWN_MS, 15 * 60 * 1000);
const WB_RESPAWN = envNum(process.env.WB_RESPAWN_MS, 30 * 60 * 1000);
const DEATH_LOCK = envNum(process.env.RAID_DEATH_MS, 60 * 1000);
const MAX_LEVEL = Math.min(500, envNum(process.env.RAID_MAX_LEVEL, 200));
const WORLD = "__world";
const REVIVE_HP = 0.3;

// pool nama berbeda: boss grup vs world boss
const GROUP_BOSSES = [
  { base: "Ancient Golem", emoji: "🗿" },
  { base: "Shadow Wyrm", emoji: "🐉" },
  { base: "Abyss Titan", emoji: "👹" },
  { base: "Frost Behemoth", emoji: "🧊" }
];
const WORLD_BOSSES = [
  { base: "Chrono Leviathan", emoji: "🌀" },
  { base: "Void Seraph", emoji: "🕊️" },
  { base: "Inferno Colossus", emoji: "🔥" },
  { base: "Nether Kraken", emoji: "🦑" }
];

// gelar mengikuti level; "Ancient ..." bentrok -> "Prime"
const TITLES = [
  [180, "Eternal"],
  [160, "Primordial"],
  [140, "Abyssal"],
  [120, "Celestial"],
  [100, "Mythic"],
  [80, "Arcane"],
  [60, "Ancient"],
  [40, "Elder"],
  [20, ""],
  [0, "Young"]
];

const titleFor = (level) => {
  const n = Number(level) || 1;
  return (TITLES.find(([min]) => n >= min) || TITLES[TITLES.length - 1])[1];
};

const displayName = (base, level) => {
  const title = titleFor(level);
  const prefix = !title ? "" : title === "Ancient" && /^ancient\b/i.test(base) ? "Prime" : title;
  return `${prefix ? prefix + " " : ""}${base}`;
};

let cache = null;
const load = () => {
  if (!cache) cache = readJson(FILE, {}) || {};
  return cache;
};
const save = () => writeJson(FILE, cache);

const clampLevel = (level) => Math.max(1, Math.min(MAX_LEVEL, Math.round(level)));

const spawnBoss = (pool, level) => {
  const picked = pool[randInt(0, pool.length - 1)];
  const lv = clampLevel(level);
  const maxHp = Math.floor(600 + lv * 160);
  return {
    base: picked.base,
    name: displayName(picked.base, lv),
    emoji: picked.emoji,
    level: lv,
    hp: maxHp,
    maxHp,
    atk: Math.floor(18 + lv * 4),
    def: Math.floor(4 + lv * 2),
    participants: {},
    active: true,
    spawnedAt: Date.now(),
    defeatedAt: 0
  };
};

const hpBar = (state) => makeBar(Math.max(0, state.hp), state.maxHp, 12);
const pct = (part, total) => (total > 0 ? Math.round((part / total) * 100) : 0);
const leftText = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s >= 60) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${s}s`;
};

const topText = (state, limit = 3) => {
  const rows = Object.entries(state.participants || {})
    .map(([id, val]) => ({ id, ...val }))
    .sort((a, b) => b.damage - a.damage)
    .slice(0, limit)
    .map((p, i) => `${i + 1}. ${p.name} (${p.damage})`);
  return rows.join("\n") || "Belum ada";
};

const bossBlock = (state, heading) =>
  `${heading}\n${state.emoji} *${state.name}*\n❤️ ${Math.max(0, state.hp)}/${state.maxHp}\n${hpBar(state)}`;

// hadiah berbasis share damage; tier bonus untuk kontributor besar
const rewardsFor = (state) => {
  const participants = Object.entries(state.participants || {})
    .map(([id, val]) => ({ id, ...val }))
    .sort((a, b) => b.damage - a.damage);
  const total = participants.reduce((sum, p) => sum + p.damage, 0) || 1;

  return participants.map((p, index) => {
    const share = p.damage / total;
    const tier = share >= 0.3 ? "top" : share >= 0.1 ? "mid" : "base";
    const bonus = tier === "top" ? 1.25 : 1;
    const gold = Math.floor((150 + state.level * 20 + share * state.maxHp * 0.3) * bonus);
    const exp = Math.floor((40 + state.level * 5 + share * state.maxHp * 0.1) * bonus);
    const itemChance = tier === "top" ? 1 : tier === "mid" ? 0.5 : 0;
    return { id: p.id, name: p.name, damage: p.damage, share, rank: index + 1, tier, gold, exp, itemChance };
  });
};

const grantRewards = (state) => {
  const rewards = rewardsFor(state);
  for (const r of rewards) {
    db.addMoney(r.id, r.gold);
    db.addExp(r.id, r.exp);
    r.item = null;
    if (Math.random() < r.itemChance) {
      const rarity = state.level >= 60 ? "Epic" : state.level >= 20 ? "Rare" : "Uncommon";
      const item = equipmentDrop(rarity);
      if (item) {
        db.addItem(r.id, { name: item.name, emoji: item.emoji, qty: 1 });
        r.item = item;
      }
    }
    db.checkAchievements(r.id);
  }
  return rewards;
};

const dmParticipants = async (client, rewards, heading) => {
  for (const r of rewards) {
    const lines = [
      heading,
      "",
      `Peringkat : #${r.rank} dari ${rewards.length}`,
      `Damage    : ${r.damage} (${Math.round(r.share * 100)}% dari total)`,
      `Hadiah    : ${r.gold} gold, ${r.exp} EXP`,
      r.item ? `Item      : ${r.item.emoji} ${r.item.name}` : null
    ].filter(Boolean);
    try {
      await client.sendMessage(`${r.id}@s.whatsapp.net`, { text: lines.join("\n") });
    } catch (err) {
      logger.warn(`raid: DM ke ${r.id} gagal: ${err.message}`);
    }
  }
};

const isDown = (user, now) => Number(user.raidLock) > 0 && now - Number(user.raidLock) < DEATH_LOCK;

const restoreIfRevived = (user, now) => {
  if (!Number(user.raidLock)) return false;
  if (now - Number(user.raidLock) < DEATH_LOCK) return false;
  const stats = db.getStats(user);
  db.updateUser(user.id, (u) => {
    u.hp = Math.max(1, Math.floor(stats.maxHp * REVIVE_HP));
    u.raidLock = 0;
  });
  return true;
};

const damageOf = (stats, state) => {
  const crit = Math.random() < 0.15 ? 1.5 : 1;
  const raw = Math.floor((stats.atk * 1.5 - state.def + randInt(0, 10)) * crit);
  return { damage: Math.max(5, raw), crit };
};

const counterOf = (state, stats, maxHp) => {
  const raw = Math.floor(state.atk / 2 - stats.def / 3) + randInt(0, 8);
  const capped = Math.min(Math.floor(maxHp * 0.2), Math.max(5, raw));
  return Math.max(1, capped);
};

const groupOf = () => load();

const ensureGroupBoss = (key, user) => {
  const data = groupOf();
  let state = data[key];
  if (state && state.active) return { state, spawned: false };
  if (state && !state.active && Date.now() - Number(state.defeatedAt || 0) <= GROUP_RESPAWN) return { state, spawned: false };
  const level = clampLevel((user.level || 1) + 2 + randInt(0, 3));
  state = spawnBoss(GROUP_BOSSES, level);
  data[key] = state;
  save();
  return { state, spawned: true };
};

const ensureWorldBoss = (user) => {
  const data = groupOf();
  let state = data[WORLD];
  if (state && state.active) return { state, spawned: false };
  if (state && !state.active && Date.now() - Number(state.defeatedAt || 0) <= WB_RESPAWN) return { state, spawned: false };
  const level = clampLevel((user.level || 1) + 2 + randInt(0, 3));
  state = spawnBoss(WORLD_BOSSES, level);
  data[WORLD] = state;
  save();
  return { state, spawned: true };
};

const menuText = (user, groupState, worldState) => {
  const line = (label, state, respawn) => {
    if (!state) return `${label}: belum ada boss`;
    if (state.active) return `${label}: ${state.emoji} ${state.name} — ${Math.max(0, state.hp)}/${state.maxHp}`;
    const left = respawn - (Date.now() - Number(state.defeatedAt || 0));
    return `${label}: tumbang · spawn ${leftText(Math.max(0, left))}`;
  };
  const mine = groupState?.participants?.[user.id]?.damage || 0;
  const worldMine = worldState?.participants?.[user.id]?.damage || 0;

  return [
    "🐉 *RAID MENU*",
    "",
    line("Boss grup ", groupState, GROUP_RESPAWN),
    line("World boss", worldState, WB_RESPAWN),
    "",
    `Damage kamu: grup ${mine} · world ${worldMine}`,
    "",
    "*Boss grup:*",
    ...GROUP_BOSSES.map((b) => `• ${b.emoji} ${b.base}`),
    "*World boss:*",
    ...WORLD_BOSSES.map((b) => `• ${b.emoji} ${b.base}`),
    "",
    `Serang: cooldown ${ATTACK_CD / 1000}s · tumbang = terkunci ${DEATH_LOCK / 1000}s`
  ].join("\n");
};

const menuButtons = () => [
  {
    name: "single_select",
    buttonParamsJson: JSON.stringify({
      title: "Aksi Raid",
      sections: [
        {
          title: "Raid",
          rows: [
            { id: "raid attack", title: "⚔️ Serang Boss Grup", description: "Damage + boss membalas" },
            { id: "raid join", title: "🎯 Pilih Boss", description: "Boss grup atau world boss" },
            { id: "raid wb", title: "🌍 Serang World Boss", description: "Join otomatis" },
            { id: "raid status", title: "📊 Status Lengkap", description: "HP & cooldown spawn" },
            { id: "raid top", title: "🏆 Top Damage", description: "Peringkat grup & world" },
            { id: "rpg", title: "⬅️ Kembali", description: "Menu RPG" }
          ]
        }
      ]
    })
  }
];

const joinPicker = (groupState, worldState) => {
  const rows = [];
  if (groupState?.active) {
    rows.push({ id: "raid attack", title: `⚔️ Boss Grup — ${groupState.name}`, description: `${Math.max(0, groupState.hp)}/${groupState.maxHp} HP` });
  }
  if (worldState?.active) {
    rows.push({ id: "raid wb", title: `🌍 World Boss — ${worldState.name}`, description: `${Math.max(0, worldState.hp)}/${worldState.maxHp} HP · ${Object.keys(worldState.participants || {}).length} peserta` });
  }
  return rows;
};

const execute = async (client, message, args, commands, commandName) => {
  const sender = message.key.remoteJid;
  const userId = getUserId(message);
  if (!userId) throw new Error("Tidak bisa mengenali pengirim.");

  const action = String(args[0] || "").toLowerCase();
  const user = db.getUser(userId, message.pushName || "Player");
  const data = load();
  const groupKey = sender.endsWith("@g.us") ? sender : null;
  const groupState = groupKey ? data[groupKey] : null;
  const worldState = data[WORLD] || null;
  const send = (text) => client.sendMessage(sender, { text }, { quoted: message });

  // menu utama
  if (!action) {
    return client.sendButtons(sender, {
      title: "🐉 Raid Boss",
      text: menuText(user, groupState, worldState),
      footer: `Cooldown serang ${ATTACK_CD / 1000} detik`,
      buttons: menuButtons()
    }, { quoted: message });
  }

  if (action === "join") {
    const rows = joinPicker(groupState, worldState);
    if (!rows.length) {
      await send(
        "❌ *Tidak ada boss aktif.*\n\nBoss grup spawn otomatis saat kamu menyerang (cooldown 15 menit setelah tumbang).\nWorld boss spawn 30 menit setelah tumbang."
      );
      return false;
    }
    return client.sendButtons(sender, {
      title: "🎯 Pilih Boss",
      text: `${groupState?.active ? bossBlock(groupState, "Boss grup") : "Boss grup: belum ada"}\n\n${worldState?.active ? bossBlock(worldState, "World boss") : "World boss: belum ada"}`,
      footer: "Serang sesuai target",
      buttons: [{ name: "single_select", buttonParamsJson: JSON.stringify({ title: "Pilih Boss", sections: [{ title: "Boss", rows }] }) }]
    }, { quoted: message });
  }

  if (action === "status") {
    const parts = ["🐉 *RAID STATUS*", ""];
    parts.push(groupState ? bossBlock(groupState, "Boss grup") + `\nTop:\n${topText(groupState)}` : "Boss grup: belum ada");
    parts.push("");
    parts.push(worldState ? bossBlock(worldState, "World boss") + `\nPeserta: ${Object.keys(worldState.participants || {}).length}\nTop:\n${topText(worldState)}` : "World boss: belum ada");
    if (groupState && !groupState.active) parts.push(`\nSpawn boss grup: ${leftText(GROUP_RESPAWN - (Date.now() - Number(groupState.defeatedAt || 0)))}`);
    if (worldState && !worldState.active) parts.push(`Spawn world boss: ${leftText(WB_RESPAWN - (Date.now() - Number(worldState.defeatedAt || 0)))}`);
    return send(parts.join("\n"));
  }

  if (action === "top") {
    return send(
      [
        "🏆 *TOP DAMAGE*",
        "",
        "*Boss grup*",
        groupState ? topText(groupState, 5) : "belum ada",
        "",
        "*World boss*",
        worldState ? topText(worldState, 5) : "belum ada"
      ].join("\n")
    );
  }

  if (action === "leave") {
    if (worldState?.participants?.[userId]) {
      db.updateUser(userId, (u) => { u.raidLeft = Date.now(); });
      return send("👋 Kamu keluar dari world boss. Damage yang sudah tercatat tetap dihitung untuk hadiah.");
    }
    return send("Kamu belum ikut world boss.");
  }

  const isWorld = action === "wb" || action === "world" || action === "worldboss";
  if (action !== "attack" && !isWorld) {
    return send(`Format: *raid* (menu) · *raid join* · *raid attack* · *raid wb* · *raid status* · *raid top*`);
  }

  // ---------- serangan ----------
  const now = Date.now();
  if (isDown(user, now)) {
    const sisa = leftText(DEATH_LOCK - (now - Number(user.raidLock)));
    return send(`💀 Kamu tumbang. Tidak bisa menyerang selama ${sisa}.`);
  }
  restoreIfRevived(user, now);

  if (user.lastRaid && now - user.lastRaid < ATTACK_CD) {
    const sisa = Math.ceil((ATTACK_CD - (now - user.lastRaid)) / 1000);
    return send(`⏳ Tunggu ${(ATTACK_CD / 1000).toFixed(0)} detik antar serangan (sisa ${sisa}s).`);
  }

  let state;
  if (isWorld) {
    ({ state } = ensureWorldBoss(user));
  } else {
    if (!groupKey) throw new Error("Boss grup hanya bisa diserang di grup. World boss bisa lewat .raid wb.");
    ({ state } = ensureGroupBoss(groupKey, user));
  }

  if (!state.active) {
    const left = (isWorld ? WB_RESPAWN : GROUP_RESPAWN) - (now - Number(state.defeatedAt || 0));
    return send(`☠️ ${state.name} sudah tumbang. Spawn lagi dalam ${leftText(left)}.`);
  }

  const stats = db.getStats(user);
  const { damage, crit } = damageOf(stats, state);
  state.hp -= damage;
  const prev = state.participants[userId] || { name: user.name, damage: 0 };
  state.participants[userId] = { name: user.name, damage: prev.damage + damage };

  const counter = counterOf(state, stats, stats.maxHp);
  const hpAfter = Math.max(0, Number(user.hp || 0) - counter);

  db.updateUser(userId, (u) => {
    u.lastRaid = now;
    u.hp = hpAfter;
    u.stats.raidDamage = (u.stats.raidDamage || 0) + damage;
    if (hpAfter <= 0) u.raidLock = now;
  });
  db.addQuestProgress(userId, "raid", 1);
  save();

  const lines = [
    `💥 *${user.name}* menyerang ${state.emoji} *${state.name}*!`,
    `⚔️ Damage: ${damage}${crit > 1 ? " (CRIT)" : ""}`,
    `🩸 Boss membalas: ${counter}`,
    `❤️ HP kamu: ${hpAfter}/${stats.maxHp}`
  ];

  if (hpAfter <= 0) {
    lines.push("", `💀 *KAMU TUMBANG*`, `Tidak bisa menyerang ${DEATH_LOCK / 1000} detik. Pulih otomatis 30% HP setelahnya (atau .heal).`);
  }

  if (state.hp <= 0) {
    state.hp = 0;
    state.active = false;
    state.defeatedAt = now;
    save();

    const rewards = grantRewards(state);
    const rewardLines = rewards
      .map((r) => `#${r.rank} ${r.name}: ${r.gold} gold, ${r.exp} exp${r.item ? `, ${r.item.emoji} ${r.item.name}` : ""}`)
      .join("\n");

    lines.push("", `☠️ *BOSS TUMBANG!*`, "", `🎁 Hadiah (total damage ${rewards.reduce((s, r) => s + r.damage, 0)}):`, rewardLines);
    await send(lines.join("\n"));

    await dmParticipants(
      client,
      rewards,
      `☠️ ${state.emoji} *${state.name}* tumbang di raid${isWorld ? " world" : ""}!`
    );

    if (isWorld && groupKey) {
      const others = Object.keys(data).filter((k) => k.endsWith("@g.us") && k !== groupKey);
      for (const jid of others.slice(0, 20)) {
        try {
          await client.sendMessage(jid, { text: `🌍 *WORLD BOSS TUMBANG*\n${state.emoji} ${state.name}\nTotal damage: ${rewards.reduce((s, r) => s + r.damage, 0)}` });
        } catch {}
      }
    }
    return true;
  }

  lines.push("", bossBlock(state, "Status"));
  return send(lines.join("\n"));
};

module.exports = {
  name: "raid",
  command: ["raid", "boss"],
  category: "rpg",
  visible: true,
  description: "Raid boss grup & world boss (join, damage, hadiah dari share damage)",
  subcommands: ["join", "attack", "wb", "status", "top", "leave"],
  execute: guarded("raid", execute),
  _internal: {
    titleFor,
    displayName,
    spawnBoss,
    damageOf,
    counterOf,
    rewardsFor,
    menuText,
    joinPicker,
    ensureGroupBoss,
    ensureWorldBoss,
    GROUP_BOSSES,
    WORLD_BOSSES,
    ATTACK_CD,
    GROUP_RESPAWN,
    WB_RESPAWN,
    DEATH_LOCK,
    MAX_LEVEL,
    resetCache: () => { cache = null; }
  }
};
