const TZ = "Asia/Jakarta";

const stamp = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("id-ID", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);

  const get = (type) => parts.find((p) => p.type === type)?.value || "";

  return `${get("year")}-${get("month")}-${get("day")} ${get("weekday")} ${get("hour")}:${get("minute")}:${get("second")} WIB`;
};

// Jam saja: HH:MM:SS WIB
const timeWIB = (date = new Date()) => {
  const text = new Intl.DateTimeFormat("id-ID", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);

  return `${text.replace(/\./g, ":")} WIB`;
};

// Salam sesuai jam WIB
const greeting = (date = new Date()) => {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(date)
  );
  if (hour < 11) return "Selamat Pagi";
  if (hour < 15) return "Selamat Siang";
  if (hour < 18) return "Selamat Sore";
  return "Selamat Malam";
};

module.exports = { stamp, timeWIB, greeting, TZ };
