module.exports = {
  prefixes: ["!", "/", "-", "+", ".", "#"],
  botName: "Zenyn",
  database: "./database",
  session: "./session",
  phoneNumber: "+6285870956410",
  owners: ["62895327668200", "6285894217616"],
  ownerContact: "62895327668200",
  groupLink: "https://chat.whatsapp.com/CH1Nuh2aFEv5Cxb18qjZiT?s=cl&p=a&iam=2",
  richCard: true,
  richBotJid: "867051314767696@bot",
  autoorder: {
    base: "https://auto-order.alxzyy.my.id/api/v2",
    apiKey: "", // kosongkan -> pakai env AUTOORDER_API_KEY
    pollMs: 6000,
    maxPending: 3
  },
  ai: { premiumImages: true },
  ytsummarize: { premium: true, cooldownMs: 60000 },
  confess: { premium: true, cooldownMs: 300000, maxLen: 300 },
  nokos: require("./setting/nokos"),
  broadcast: require("./setting/broadcast"),
  catur: require("./setting/catur"),
  premiumPackages: {
    "7": { label: "Seminggu", price: 2000, days: 7 },
    "30": { label: "Sebulan", price: 5000, days: 30 }
  },
  addbotPackages: {
    "30": { label: "Sebulan", price: 3000, days: 30 },
    "0": { label: "Permanen", price: 12000, days: 0 }
  },
  // premium key dijual dengan IDR; 5 key = Rp1.000, tanpa batas pembelian
  keyPackages: {
    "1": { label: "1 Premium Key", qty: 1, price: 200 },
    "5": { label: "5 Premium Key", qty: 5, price: 1000 },
    "10": { label: "10 Premium Key", qty: 10, price: 2000 }
  },
  bmkgBase: "https://data.bmkg.go.id/DataMKG/TEWS/",
  quakeNotify: true,
  quakePollMs: 60000,
  quakeDelayMs: 10000,
  aiModel: "gemini-3.5-flash",
  aiImageModel: "gemini-2.5-flash-image",
  aiImageFallbackModels: ["gemini-3.1-flash-image", "gemini-3-pro-image"],
  aiImageFallbackProvider: "pollinations",
  aiImageFallbackModel: "flux",
  aiImageFallbackBase: "https://image.pollinations.ai/prompt",
  aiFallbackModels: ["gemini-3-flash-preview", "gemini-3.8-flash"],
  aiApiBase: "https://generativelanguage.googleapis.com/v1beta/models",
  aiInteractionsBase: "https://generativelanguage.googleapis.com/v1beta/interactions"
};
