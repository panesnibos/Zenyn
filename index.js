const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, normalizeMessageContent } = require("@whiskeysockets/baileys");
const fs = require("fs");
const path = require("path");
const pino = require("pino");
const { loadEnv } = require("./lib/env");
const config = require("./config");
const helper = require("baileys_helper");
const { loadCommands } = require("./lib/commandLoader");
const logger = require("./lib/logger");
const { getTip } = require("./lib/tips");
const { setPrefix, getPrefixByJid } = require("./lib/prefix");
const { recordFromKey, recordMapping, resolvePn } = require("./lib/lid");
const { getSenderJids, normalizeNumber, getUserId, isPnJid, isLidJid } = require("./lib/rpgutil");
const { db } = require("./lib/rpgdb");
const { isOwner } = require("./lib/owner");
const { statusOf, commandCost, usesLimit } = require("./lib/rpglimit");

const loadedEnv = loadEnv();
if (loadedEnv.length) logger.info(`env dimuat: ${loadedEnv.join(", ")}`);

const commandsDir = path.join(__dirname, "commands");

const getMessageText = (msg) => {
  if (!msg) return "";
  return (
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    msg.documentMessage?.caption ||
    ""
  );
};

logger.banner("ZENYN BOT", "WhatsApp RPG Economy Bot");
logger.kv("Prefix", config.prefixes.join("  "));
logger.kv("Owners", config.owners.join(", "));
logger.kv("Phone", config.phoneNumber);
logger.divider();

let commands = loadCommands(commandsDir);
logger.divider();

// Auto-reload commands saat ada perubahan file (pantau subfolder juga)
let reloadTimer = null;
const triggerReload = () => {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    logger.warn("Reloading commands...");
    commands = loadCommands(commandsDir);
    logger.ok("Commands reloaded");
  }, 300);
};

const watchDirs = [commandsDir];
for (const entry of fs.readdirSync(commandsDir, { withFileTypes: true })) {
  if (entry.isDirectory()) watchDirs.push(path.join(commandsDir, entry.name));
}

for (const dir of watchDirs) {
  fs.watch(dir, (eventType, filename) => {
    if (filename && filename.endsWith(".js")) triggerReload();
  });
}

let client;
let reconnectAttempts = 0;
const maxReconnectAttempts = Infinity;

async function connectBot() {
  try {
    const sessionPath = path.join(config.session);
    
    if (!fs.existsSync(sessionPath)) {
      fs.mkdirSync(sessionPath, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

    client = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      browser: Browsers.ubuntu("Chrome"),
      syncFullHistory: false,
      logger: pino({ level: "silent" })
    });

    client.sendInteractiveMessage = async (jid, messageConfig, options = {}) => {
      const { text, title, tip, interactiveButtons, buttons = [] } = messageConfig;
      const helperConfig = {
        text: text,
        footer: tip || getTip(getPrefixByJid(jid)),
        interactiveButtons: interactiveButtons || buttons
      };
      if (title) helperConfig.title = title;
      return await helper.sendInteractiveMessage(client, jid, helperConfig, options);
    };

    client.sendButtons = async (jid, messageConfig, options = {}) => {
      const footer = messageConfig.tip || getTip(getPrefixByJid(jid));
      return await helper.sendButtons(client, jid, { ...messageConfig, footer }, options);
    };

    if (!state.creds.registered) {
      const phoneNumber = config.phoneNumber.replace(/[^0-9]/g, "");

      logger.warn("Session belum terdaftar, menyiapkan pairing code...");

      setTimeout(async () => {
        const code = await client.requestPairingCode(phoneNumber);
        logger.section("PAIRING CODE");
        logger.kv("Code", code);
        logger.info("WhatsApp → Linked Devices → Link a Device → Link with phone number");
      }, 3000);
    }

    client.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === "connecting") {
        logger.info("Connecting...");
      } else if (connection === "open") {
        logger.ok("Bot connected!");
        logger.kv("Phone", client.user.id);
        reconnectAttempts = 0;
      } else if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const reason = lastDisconnect?.error?.message || lastDisconnect?.error?.output?.payload?.message;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        logger.warn(`Koneksi tertutup: status=${statusCode ?? "-"}${reason ? ` (${reason})` : ""}`);

        if (shouldReconnect) {
          reconnectAttempts++;
          logger.warn(`Disconnected (attempt ${reconnectAttempts}). Reconnecting in 5s...`);
          setTimeout(connectBot, 5000);
        } else {
          logger.error("Logged out");
        }
      }
    });

    client.ev.on("creds.update", saveCreds);
    client.ev.on("lid-mapping.update", (mapping) => {
      recordMapping(mapping?.lid, mapping?.pn);
    });

    client.ev.on("messages.upsert", async (m) => {
      try {
        const list = m.messages || [];

        for (const raw of list) {
          const message = { ...raw, message: normalizeMessageContent(raw.message) };
          const sender = message.key.remoteJid;
          const text = getMessageText(message.message);

          if (!message.message || message.key.fromMe) continue;

          recordFromKey(message.key);

          const senderJids = getSenderJids(message);
          const lidJid = senderJids.find(isLidJid);
          let pnJid = senderJids.find(isPnJid);

          if (!pnJid && lidJid) pnJid = await resolvePn(client, lidJid);

          if (pnJid) {
            const pnId = normalizeNumber(pnJid);
            message.canonicalUserId = pnId;

            if (lidJid) {
              const lidId = normalizeNumber(lidJid);
              if (lidId && lidId !== pnId) db.mergeUsers(lidId, pnId);
            }
          }

          // Dispatch command helper
          const runCommand = async (command, args) => {
            const cmd = commands[command.toLowerCase()];
            if (!cmd) return false;

            const isGroup = /@g\.us$/i.test(String(sender));
            const needsGroup = cmd.group === true || cmd.category === "rpg";

            if (needsGroup && !isGroup) {
              await client.sendMessage(sender, {
                text: "❌ Fitur ini hanya bisa dipakai di grup \nhttps://chat.whatsapp.com/JjtVVD53f1HJ77gNrfMQHb"
              }, { quoted: message });
              return true;
            }

            if (cmd.category === "rpg" && !isOwner(message)) {
              const uid = getUserId(message);
              if (uid) {
                const user = db.getUser(uid, message.pushName || "Player");
                if (!user.registered) {
                  const p = getPrefixByJid(sender);
                  await client.sendMessage(sender, {
                    text: `🔒 *Registrasi diperlukan*\n\nFitur RPG hanya untuk user yang sudah terdaftar.\n\nKetik *${p}register nama* untuk mendaftar.`
                  }, { quoted: message });
                  return true;
                }
              }
            }

            let pending = null;

            if (usesLimit(cmd)) {
              const uid = getUserId(message);
              if (uid) {
                const user = db.getUser(uid, message.pushName || "Player");
                if (statusOf(user) === "User") {
                  const cost = commandCost(cmd);
                  if (user.limit < cost) {
                    await client.sendMessage(sender, {
                      text: `🚫 *Limit habis*\nFitur ini butuh ${cost} limit, sisa kamu ${user.limit}.\n\nLimit reset tiap hari (${user.limitMax}/hari).\nPremium/Donatur = ∞.`
                    }, { quoted: message });
                    return true;
                  }
                  pending = { uid, cost, limitMax: user.limitMax };
                }
              }
            }

            let success = true;
            let finalCost = pending ? pending.cost : 0;
            try {
              const result = await cmd.execute(client, message, args, commands, command.toLowerCase());
              if (result === false) success = false;
              else if (result && typeof result === "object" && result.limitCost !== undefined) {
                finalCost = commandCost(cmd, result.limitCost);
              }
            } catch (err) {
              success = false;
              logger.error(`command ${command}: ${err.message}`);
              await client.sendMessage(sender, { text: "❌ Error executing command" }, { quoted: message });
            }

            if (success && pending) {
              const current = db.getUser(pending.uid, message.pushName || "Player");
              const chargedCost = Math.min(finalCost, Math.max(0, current.limit ?? 0));
              const remaining = chargedCost > 0 ? db.addLimit(pending.uid, -chargedCost) : current.limit ?? 0;
              const note = chargedCost < finalCost
                ? `🎟️ *Limit terpakai:* -${chargedCost} (butuh ${finalCost})\nSisa limit: *${remaining ?? 0}/${pending.limitMax}*`
                : `🎟️ *Limit terpakai:* -${chargedCost}\nSisa limit: *${remaining ?? 0}/${pending.limitMax}*`;
              await client.sendMessage(sender, { text: note }, { quoted: message }).catch(() => {});
            }

            return true;
          };

          // Handle button/interactive response
          let buttonId = null;
          const irm = message.message.interactiveResponseMessage;
          if (irm) {
            try {
              const params = JSON.parse(irm.nativeFlowResponseMessage?.paramsJson || "{}");
              buttonId = params.id || params.selectedId || params.selected_id || null;
            } catch (err) {
              logger.error(`button response parse: ${err.message}`);
            }
          } else if (message.message.buttonsResponseMessage) {
            buttonId = message.message.buttonsResponseMessage.selectedButtonId;
          } else if (message.message.templateButtonReplyMessage) {
            buttonId = message.message.templateButtonReplyMessage.selectedId;
          } else if (message.message.listResponseMessage) {
            buttonId = message.message.listResponseMessage.singleSelectReply?.selectedRowId;
          }

          if (buttonId) {
            logger.cmd(`button: ${buttonId}`);
            const parts = String(buttonId).trim().split(/\s+/);
            const command = parts[0];
            const args = parts.slice(1);

            if (command.startsWith("ping_")) {
              await runCommand("ping", []);
            } else {
              const handled = await runCommand(command, args);
              if (!handled) {
                logger.warn(`No command for button id: ${buttonId}`);
              }
            }
            continue;
          }

          logger.msg(`[${sender}] ${text}`);

          // Deteksi prefix
          let prefix = null;
          let command = null;
          let args = [];

          for (const p of config.prefixes) {
            if (text.startsWith(p)) {
              prefix = p;
              const content = text.slice(p.length).trim();
              const parts = content.split(" ");
              command = parts[0].toLowerCase();
              args = parts.slice(1);
              break;
            }
          }

          if (!prefix || !command) continue;

          setPrefix(message, prefix);
          await runCommand(command, args);
        }
      } catch (err) {
        logger.error(`process message: ${err.message}`);
      }
    });

  } catch (err) {
    logger.error(`connection: ${err.message}`);
    setTimeout(connectBot, 5000);
  }
}

connectBot();

process.on("SIGINT", () => {
  logger.warn("Bot stopped");
  process.exit();
});
