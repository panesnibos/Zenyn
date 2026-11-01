const LIMIT_CATEGORIES = new Set(["tools", "downloader"]);

const RESET_AMOUNT = 20;

const PERMANENT = 0;

const DURATIONS = [
  { value: 7, label: "7 Hari" },
  { value: 30, label: "30 Hari" },
  { value: 90, label: "3 Bulan" },
  { value: 180, label: "6 Bulan" },
  { value: PERMANENT, label: "Selamanya" }
];

const statusOf = (user) => {
  const s = user?.status;
  if (s && s.type && s.type !== "User") {
    if (s.until === PERMANENT || s.until === null || s.until > Date.now()) {
      return s.type;
    }
  }
  return "User";
};

const isPremium = (user) => statusOf(user) !== "User";

const formatLimit = (user) => (isPremium(user) ? "∞" : `${user?.limit ?? 0}/${user?.limitMax ?? RESET_AMOUNT}`);

const commandCost = (cmd) => Math.max(0, Number(cmd?.limit) || 0);

const usesLimit = (cmd) => LIMIT_CATEGORIES.has(cmd?.category) && commandCost(cmd) > 0;

const untilFromDuration = (days) => {
  const d = Number(days);
  if (!Number.isFinite(d) || d <= 0) return PERMANENT;
  return Date.now() + d * 24 * 60 * 60 * 1000;
};

module.exports = {
  LIMIT_CATEGORIES,
  RESET_AMOUNT,
  PERMANENT,
  DURATIONS,
  statusOf,
  isPremium,
  formatLimit,
  commandCost,
  usesLimit,
  untilFromDuration
};
