// lib/richsend.js — kirim kartu HTML sebagai richResponseMessage (botForwardedMessage).
// Kalau WhatsApp client tak mendukung, relayMessage tetap sukses tapi kartu mungkin tampil
// sebagai pesan bot biasa; error nyata dilempar ke pemanggil untuk fallback.

const { randomUUID } = require("crypto");
const config = require("../config");
const logger = require("./logger");

const botJid = () => String(process.env.RICH_BOT_JID || config.richBotJid || "867051314767696@bot");

const supported = (client) => typeof client?.relayMessage === "function";

const sendRichHtml = async (client, jid, html, label = "Zenyn", { quoted } = {}) => {
  if (!supported(client)) throw new Error("relayMessage tidak tersedia di socket");

  const responseId = randomUUID();
  const payload = Buffer.from(
    JSON.stringify({
      response_id: responseId,
      sections: [
        {
          view_model: {
            primitive: { __typename: "GenAIaeacdsnwHtmlPrimitive", payload: String(html), trusted_sources: [] },
            __typename: "GenAISingleLayoutViewModel"
          }
        }
      ]
    })
  ).toString("base64");

  const message = {
    messageContextInfo: {
      deviceListMetadata: {},
      deviceListMetadataVersion: 2,
      botMetadata: { messageDisclaimerText: "", botResponseId: responseId }
    },
    botForwardedMessage: {
      message: {
        richResponseMessage: {
          messageType: 1,
          submessages: [{ messageType: 2, messageText: String(label).slice(0, 120) }],
          unifiedResponse: { data: payload },
          contextInfo: {
            forwardingScore: 1,
            isForwarded: true,
            forwardedAiBotMessageInfo: { botJid: botJid() },
            forwardOrigin: 4
          }
        }
      }
    }
  };

  try {
    await client.relayMessage(jid, message, { messageId: responseId });
    logger.info(`rich: kartu terkirim ${jid}`);
    return { key: { remoteJid: jid, fromMe: true, id: responseId }, message: {} };
  } catch (err) {
    logger.warn(`rich: gagal kirim kartu: ${err.message}`);
    throw err;
  }
};

module.exports = { sendRichHtml, supported, botJid };
