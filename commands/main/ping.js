module.exports = {
  name: "ping",
  command: ["ping"],
  category: "main",
  description: "Test ping bot",
  visible: true,
  execute: async (client, message) => {
    const startTime = Date.now();
    const sentMessage = await client.sendMessage(message.key.remoteJid, { text: "🏓 Pong!" }, { quoted: message });
    const latency = Date.now() - startTime;

    await client.sendMessage(message.key.remoteJid, { text: `Latency: ${latency}ms` }, { quoted: sentMessage });
  }
};
