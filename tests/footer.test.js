// Footer interactive: nokos pakai peringatan, RPG pakai tips, lain pakai timestamp.
const test = require("node:test");
const assert = require("node:assert/strict");
const { footerFor, STORE_FOOTER } = require("../lib/tips");

test("footer nokos: NO REFF / MEMBELI = PAHAM", () => {
  assert.equal(footerFor("store", "."), "NO REFF\nMEMBELI = PAHAM");
  assert.equal(STORE_FOOTER, "NO REFF\nMEMBELI = PAHAM");
});

test("footer lain tidak ikut berubah", () => {
  assert.match(footerFor("rpg", "!"), /^💡 Tip: /);
  assert.match(footerFor("main", "."), /^\d{4}-\d{2}-\d{2} .+ WIB$/);
});
