const achievements = [
  {
    id: "first_blood",
    name: "First Blood",
    desc: "Kalahkan 1 monster",
    title: "Rookie",
    check: (u) => (u.stats?.kills || 0) >= 1
  },
  {
    id: "hunter",
    name: "Hunter",
    desc: "Kalahkan 50 monster",
    title: "Hunter",
    check: (u) => (u.stats?.kills || 0) >= 50
  },
  {
    id: "rich",
    name: "Sultan",
    desc: "Miliki 10.000 gold",
    title: "Sultan",
    check: (u) => (u.money || 0) >= 10000
  },
  {
    id: "trader",
    name: "Trader",
    desc: "Jual 20 item",
    title: "Merchant",
    check: (u) => (u.stats?.itemsSold || 0) >= 20
  },
  {
    id: "gatherer",
    name: "Gatherer",
    desc: "Kumpulkan 100 material",
    title: "Pencari",
    check: (u) => (u.stats?.gathered || 0) >= 100
  },
  {
    id: "artisan",
    name: "Artisan",
    desc: "Craft 20 item",
    title: "Artisan",
    check: (u) => (u.stats?.crafted || 0) >= 20
  },
  {
    id: "duelist",
    name: "Duelist",
    desc: "Menangkan 10 duel",
    title: "Duelist",
    check: (u) => (u.stats?.duelsWon || 0) >= 10
  },
  {
    id: "dungeon_10",
    name: "Dungeon Explorer",
    desc: "Capai dungeon floor 10",
    title: "Explorer",
    check: (u) => (u.stats?.dungeonBest || 0) >= 10
  },
  {
    id: "raid_hero",
    name: "Raid Hero",
    desc: "Total damage raid 10.000",
    title: "Raid Hero",
    check: (u) => (u.stats?.raidDamage || 0) >= 10000
  },
  {
    id: "beastmaster",
    name: "Beastmaster",
    desc: "Latih pet sampai level 10",
    title: "Beastmaster",
    check: (u) => (u.pet?.level || 0) >= 10
  },
  {
    id: "legend",
    name: "Legend",
    desc: "Capai level 50",
    title: "Legend",
    check: (u) => (u.level || 1) >= 50
  },
  {
    id: "reborn",
    name: "Reborn",
    desc: "Lakukan prestige 1x",
    title: "Reborn",
    check: (u) => (u.prestige || 0) >= 1
  }
];

module.exports = { achievements };
