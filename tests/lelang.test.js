// Lelang: escrow item & gold, bid minimal +5%, anti-snipe, buyout, settle.
// Semua pakai db & file JSON tiruan — tidak menyentuh database asli.
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

const quiet = { info() {}, warn() {}, error() {}, cmd() {}, ok() {}, msg() {}, debug() {} };
const memJson = () => {
  let data = {};
  return {
    readJson: () => JSON.parse(JSON.stringify(data)),
    writeJson: (_f, next) => { data = JSON.parse(JSON.stringify(next)); }
  };
};

// db tiruan: saldo + inventory per user
const makeDb = () => {
  const users = {};
  const ensure = (id) => {
    if (!users[id]) users[id] = { id, name: id, money: 0, inventory: [], stats: { itemsBought: 0, itemsSold: 0 } };
    return users[id];
  };
  const find = (u, name) => u.inventory.find((i) => i.name.toLowerCase() === String(name).toLowerCase());
  return {
    users,
    ensure,
    getUser: (id, name) => { const u = ensure(id); if (name) u.name = name; return u; },
    addMoney: (id, n) => { ensure(id).money = Math.max(0, ensure(id).money + n); return ensure(id).money; },
    addItem: (id, item) => { ensure(id).inventory.push({ ...item }); },
    hasItem: (id, name, qty = 1) => { const it = find(ensure(id), name); return !!it && it.qty >= qty; },
    removeItem: (id, name, qty = 1) => {
      const it = find(ensure(id), name);
      if (!it) return false;
      it.qty -= qty;
      if (it.qty <= 0) ensure(id).inventory = ensure(id).inventory.filter((x) => x !== it);
      return true;
    },
    addStat: (id, key, n) => { ensure(id).stats[key] = (ensure(id).stats[key] || 0) + n; },
    addQuestProgress() {},
    checkAchievements: () => []
  };
};

const setup = () => {
  const db = makeDb();
  const al = loadMocked("lib/auction.js", { "./rpgjson": memJson(), "./logger": quiet, "./rpgdb": { db } });
  return { al, db };
};

const seller = "628100000001";
const bidder = "628100000002";
const rival = "628100000003";
const item = { name: "Wooden Sword", emoji: "🗡️" };

const withItem = (db, uid) => {
  db.ensure(uid).inventory.push({ ...item, qty: 1 });
  return db;
};

test("auction: lot mengunci item penjual, tidak bisa dobel", () => {
  const { al, db } = setup();
  withItem(db, seller);
  const lot = al.create({ sellerId: seller, sellerName: "Penjual", chat: "chat@g.us", def: item, qty: 1, start: 800, buyout: 2000 });
  assert.equal(lot.start, 800);
  assert.equal(al.lots().length, 1);
  assert.equal(db.hasItem(seller, "Wooden Sword", 1), false, "item harus keluar dari inventory");
  assert.throws(() => al.create({ sellerId: seller, sellerName: "Penjual", chat: "chat@g.us", def: item, qty: 1, start: 500 }), /tidak punya/);
});

test("auction: bid minimal +5%, gold dikunci, penawar lama dikembalikan", () => {
  const { al, db } = setup();
  withItem(db, seller);
  db.addMoney(bidder, 5000);
  db.addMoney(rival, 5000);
  const lot = al.create({ sellerId: seller, sellerName: "Penjual", chat: "chat@g.us", def: item, qty: 1, start: 800 });

  assert.throws(() => al.bid(bidder, "Budi", lot, 700), /minimal 800/);
  al.bid(bidder, "Budi", lot, 800);
  assert.equal(db.getUser(bidder).money, 4200, "800 gold dikunci");

  assert.throws(() => al.bid(rival, "Rina", lot, 810), /minimal 840/);
  al.bid(rival, "Rina", lot, 840);
  assert.equal(db.getUser(rival).money, 4160);
  assert.equal(db.getUser(bidder).money, 5000, "penawar kalah dikembalikan");
  assert.equal(lot.topBid, 840);
  assert.equal(lot.topBidder, rival);
});

test("auction: anti-snipe memperpanjang, maksimal 3x", () => {
  const { al, db } = setup();
  withItem(db, seller);
  for (const id of [bidder, rival]) db.addMoney(id, 100000);
  const lot = al.create({ sellerId: seller, sellerName: "Penjual", chat: "chat@g.us", def: item, qty: 1, start: 100 });

  // bid di 30 detik terakhir memperpanjang 60 detik
  lot.endsAt = Date.now() + 30 * 1000;
  const before = lot.endsAt;
  al.bid(rival, "Rina", lot, 200);
  assert.equal(lot.endsAt, before + 60 * 1000, "perpanjangan +60 detik");
  assert.equal(lot.extended, 1);

  // perpanjangan dibatasi 3x
  let price = 300;
  for (let i = 0; i < 4; i++) {
    lot.endsAt = Date.now() + 30 * 1000;
    al.bid(i % 2 ? bidder : rival, "X", lot, price + 1000);
    price += 1000;
  }
  assert.equal(lot.extended, 3, "perpanjangan dibatasi 3x");
});

test("auction: buyout langsung menyerahkan item & gold ke penjual", () => {
  const { al, db } = setup();
  withItem(db, seller);
  db.addMoney(bidder, 3000);
  const lot = al.create({ sellerId: seller, sellerName: "Penjual", chat: "chat@g.us", def: item, qty: 1, start: 800, buyout: 2000 });

  const res = al.buyout(bidder, "Budi", lot);
  assert.equal(res.price, 2000);
  assert.equal(res.tax, 100);
  assert.equal(db.hasItem(bidder, "Wooden Sword", 1), true);
  assert.equal(db.getUser(seller).money, 1900, "penjual dapat harga - pajak 5%");
  assert.equal(db.getUser(bidder).money, 1000);
  assert.equal(al.lots().length, 0);
});

test("auction: lot tanpa penawar mengembalikan item, batal hanya sebelum ada bid", () => {
  const { al, db } = setup();
  withItem(db, seller);
  const lot = al.create({ sellerId: seller, sellerName: "Penjual", chat: "chat@g.us", def: item, qty: 1, start: 800 });
  al.settle(lot, {});
  assert.equal(db.hasItem(seller, "Wooden Sword", 1), true, "item kembali");

  withItem(db, seller);
  db.addMoney(bidder, 5000);
  const lot2 = al.create({ sellerId: seller, sellerName: "Penjual", chat: "chat@g.us", def: item, qty: 1, start: 800 });
  assert.throws(() => al.cancel(bidder, lot2), /bukan lot kamu/);
  al.bid(bidder, "Budi", lot2, 800);
  assert.throws(() => al.cancel(seller, lot2), /Sudah ada penawar/);
});

test("auction: settleDue mengumumkan hasil dan membersihkan lot kedaluwarsa", async () => {
  const { al, db } = setup();
  withItem(db, seller);
  db.addMoney(bidder, 5000);
  const lot = al.create({ sellerId: seller, sellerName: "Penjual", chat: "chat@g.us", def: item, qty: 1, start: 800 });
  al.bid(bidder, "Budi", lot, 800);
  lot.endsAt = Date.now() - 1000;

  const sent = [];
  al.start({ sendMessage: async (_jid, payload) => { sent.push(payload.text); } });
  await al.settleDue();
  al.stop();

  assert.equal(al.lots().length, 0);
  assert.equal(db.hasItem(bidder, "Wooden Sword", 1), true);
  assert.equal(db.getUser(seller).money, 760, "800 - pajak 40");
  assert.match(sent[0], /LELANG SELESAI/);
});
