const test = require("node:test");
const assert = require("node:assert/strict");
const { _internal } = require("../commands/owner/bcgc");

const STAMP_RE = /^Announcement \d{4}-\d{2}-\d{2} \w+ \d{2}:\d{2}:\d{2} WIB$/;

test("buildText: tanpa label ADS dan tanpa timestamp", () => {
  const text = _internal.buildText("Promo bot murah");
  assert.equal(text, "Promo bot murah");
  assert.doesNotMatch(text, /ADS|WIB|\d{4}-\d{2}-\d{2}/);
});

test("buildPayload: timestamp pindah ke footer (tip)", () => {
  const payload = _internal.buildPayload("Promo bot murah");
  assert.equal(payload.text, "Promo bot murah");
  assert.match(payload.tip, STAMP_RE);
  assert.equal(payload.interactiveButtons[0].name, "cta_url");
});
