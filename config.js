module.exports = {
  prefixes: ["!", "/", "-", "+", "."],
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
  premiumPackages: {
    "7": { label: "7 Hari", price: 5000, days: 7 },
    "30": { label: "1 Bulan", price: 15000, days: 30 },
    "60": { label: "2 Bulan", price: 25000, days: 60 },
    "90": { label: "3 Bulan", price: 35000, days: 90 }
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
