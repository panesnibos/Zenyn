const { getJson } = require("../../lib/httpclient");
const { getPrefix } = require("../../lib/prefix");
const { guarded, reply, timedStore, cooldown } = require("../../lib/featureutil");

const cache = timedStore(100);
const weatherLabel = (code) => {
  if (code === 0) return "Cerah";
  if ([1, 2, 3].includes(code)) return "Berawan";
  if ([45, 48].includes(code)) return "Berkabut";
  if ([51, 53, 55, 56, 57].includes(code)) return "Gerimis";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Hujan";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Salju";
  if ([95, 96, 99].includes(code)) return "Badai petir";
  return "Tidak diketahui";
};

const execute = async (client, message, args) => {
  const city = args.join(" ").trim();
  if (!city) return reply(client, message, `🌤️ Format: ${getPrefix(message)}cuaca <kota>\nContoh: ${getPrefix(message)}cuaca Bandung`);
  if (city.length > 100) throw new Error("Nama kota maksimal 100 karakter.");
  cooldown(message, "cuaca");
  const key = city.toLowerCase();
  let text = cache.get(key);
  if (!text) {
    const geo = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=id&format=json`);
    const place = geo.results?.[0];
    if (!place || !Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) throw new Error("Kota tidak ditemukan. Coba nama kota yang lebih spesifik.");
    const data = await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=3`);
    if (!data.current || !Array.isArray(data.daily?.time)) throw new Error("Data cuaca belum tersedia.");
    const current = data.current;
    text = [
      `🌤️ *CUACA ${place.name.toUpperCase()}*`,
      [place.admin1, place.country].filter(Boolean).join(", "),
      `Waktu: ${current.time.replace("T", " ")} (${data.timezone})`,
      "", `${weatherLabel(current.weather_code)} • ${current.temperature_2m} °C`,
      `Kelembapan: ${current.relative_humidity_2m}%`, `Angin: ${current.wind_speed_10m} km/jam`,
      "", "*Prakiraan 3 hari:*",
      ...data.daily.time.map((date, i) => `${date}: ${weatherLabel(data.daily.weather_code[i])}, ${data.daily.temperature_2m_min[i]}–${data.daily.temperature_2m_max[i]} °C, peluang hujan ${data.daily.precipitation_probability_max[i]}%`),
      "", "Sumber: Open-Meteo • Prakiraan, bukan jaminan. Cache 5 menit."
    ].join("\n");
    cache.set(key, text, 5 * 60000);
  }
  return reply(client, message, text);
};

module.exports = {
  name: "cuaca", command: ["cuaca", "weather"], category: "tools", visible: true,
  description: "Cuaca dan prakiraan kota 3 hari (Open-Meteo)", execute: guarded("cuaca", execute)
};
