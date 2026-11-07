module.exports = {
  prefixes: ["!", "/", "-", "+", "."],
  botName: "Zenyn",
  database: "./database",
  session: "./session",
  phoneNumber: "+6285870956410",
  owners: ["62895327668200", "6285894217616"],
  ownerContact: "62895327668200",
  groupLink: "https://chat.whatsapp.com/CH1Nuh2aFEv5Cxb18qjZiT?s=cl&p=a&iam=2",
  bmkgBase: "https://data.bmkg.go.id/DataMKG/TEWS/",
  quakeNotify: true,
  quakePollMs: 60000,
  quakeDelayMs: 10000,
  aiModel: "gemini-3.5-flash",
  aiFallbackModels: ["gemini-3-flash-preview", "gemini-3.8-flash"],
  aiApiBase: "https://generativelanguage.googleapis.com/v1beta/models"
};
