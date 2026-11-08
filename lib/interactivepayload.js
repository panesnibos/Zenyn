// baileys_helper's high-level converter does not attach mention context.
// Use the native message shape only when mentions are requested.
const withMentions = (payload, mentions) => {
  if (!Array.isArray(mentions) || !mentions.length) return payload;
  const interactiveMessage = {
    body: { text: payload.text || "" },
    nativeFlowMessage: { buttons: payload.interactiveButtons || [] },
    contextInfo: { mentionedJid: [...new Set(mentions)] }
  };
  if (payload.footer) interactiveMessage.footer = { text: payload.footer };
  if (payload.title) interactiveMessage.header = { title: payload.title, hasMediaAttachment: false };
  return { interactiveMessage };
};

module.exports = { withMentions };
