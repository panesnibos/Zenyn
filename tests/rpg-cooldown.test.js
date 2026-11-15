const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");

const root = path.resolve(__dirname, "..");
const loadMocked = (relative, mocks = {}) => {
  const file = path.join(root, relative);
  const nativeRequire = createRequire(file);
  const mod = { exports: {} };
  const compiled = vm.runInThisContext(
    `(function(require,module,exports,__dirname,__filename){\n${fs.readFileSync(file, "utf8")}\n})`,
    { filename: file }
  );
  compiled(
    (name) => (Object.hasOwn(mocks, name) ? mocks[name] : nativeRequire(name)),
    mod,
    mod.exports,
    path.dirname(file),
    file
  );
  return mod.exports;
};

const { cd, isPremium } = require("../lib/rpglimit");

const premiumUser = { status: { type: "Premium", until: 0 } };
const normalUser = { status: { type: "User", until: 0 } };

test("cd(): premium dapat nilai pendek, user biasa nilai normal", () => {
  assert.equal(cd(premiumUser, 25000, 15000), 15000);
  assert.equal(cd(normalUser, 25000, 15000), 25000);
  assert.equal(cd(undefined, 25000, 15000), 25000);
  assert.equal(isPremium(premiumUser), true);
  assert.equal(isPremium(normalUser), false);
});

const loadGather = (user) => {
  const sent = [];
  const client = { sendMessage: async (chat, msg) => sent.push(msg.text) };
  const gather = loadMocked("commands/rpg/gather.js", {
    "../../lib/logger": { info() {}, warn() {}, error() {}, cmd() {}, ok() {} },
    "../../lib/rpgdb": {
      db: {
        getUser: () => user,
        updateUser: (id, fn) => fn(user),
        addItem() {},
        addStat() {},
        addQuestProgress() {},
        checkAchievements: () => []
      }
    },
    "../../lib/rpgutil": { getUserId: () => "628100000001" },
    "../../lib/prefix": { getPrefix: () => "." },
    "../../lib/rpgitems": { findItemDef: (n) => ({ name: n, emoji: "⛏️" }) },
    "../../lib/rpgcombat": { randInt: () => 1 }
  });
  return { gather, sent, client };
};

const message = { key: { remoteJid: "chat@s.whatsapp.net" }, pushName: "Uji" };
const run = async (user, agoMs) => {
  user.lastGather = Date.now() - agoMs;
  const { gather, sent, client } = loadGather(user);
  await gather.execute(client, message, ["mine"], {}, "mine");
  return sent[0];
};

test("gather: premium 16 detik lalu -> boleh menambang", async () => {
  const text = await run({ ...premiumUser, lastGather: 0 }, 16000);
  assert.match(text, /MENAMBANG/i);
});

test("gather: user biasa 16 detik lalu -> ditolak, 26 detik lalu -> boleh", async () => {
  assert.match(await run({ ...normalUser, lastGather: 0 }, 16000), /masih lelah/i);
  assert.match(await run({ ...normalUser, lastGather: 0 }, 26000), /MENAMBANG/i);
});
