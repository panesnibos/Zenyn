// Tombol di chat pribadi diubah jadi teks; di grup tetap utuh.
const test = require("node:test");
const assert = require("node:assert/strict");
const { dmSafe, actionLines, isGroup } = require("../lib/interactivepayload");

const cta = { name: "cta_url", buttonParamsJson: JSON.stringify({ display_text: "Join Group", url: "https://chat.whatsapp.com/abc" }) };
const select = {
  name: "single_select",
  buttonParamsJson: JSON.stringify({
    title: "Pilih Layanan",
    sections: [{ title: "Layanan", rows: [{ id: "nokos svc 31a1", title: "WhatsApp" }] }]
  })
};
const quick = { name: "quick_reply", buttonParamsJson: JSON.stringify({ display_text: "More Benefit", id: "premium benefit" }) };

test("isGroup: hanya @g.us", () => {
  assert.equal(isGroup("120363@g.us"), true);
  assert.equal(isGroup("628123@s.whatsapp.net"), false);
  assert.equal(isGroup("159360617574424@lid"), false);
});

test("DM: tombol jadi perintah ketik, cta jadi URL", () => {
  const out = dmSafe("628123@s.whatsapp.net", { text: "Halo", interactiveButtons: [select, quick, cta] });
  assert.equal(out.interactiveButtons, undefined);
  assert.equal(out.buttons, undefined);
  assert.match(out.text, /^Halo/);
  assert.match(out.text, /Ketik salah satu:/);
  assert.match(out.text, /• WhatsApp — !nokos svc 31a1/);
  assert.match(out.text, /• More Benefit — !premium benefit/);
  assert.match(out.text, /🔗 Join Group: https:\/\/chat\.whatsapp\.com\/abc/);
});

test("DM: hanya cta_url (gempa) tetap terkirim sebagai teks", () => {
  const out = dmSafe("628123@lid", { text: "Gempa", interactiveButtons: [cta] });
  assert.equal((out.interactiveButtons || []).length, 0);
  assert.match(out.text, /https:\/\/chat\.whatsapp\.com\/abc/);
});

test("grup: payload tidak diubah", () => {
  const payload = { text: "Halo", interactiveButtons: [select, cta] };
  assert.equal(dmSafe("120363@g.us", payload), payload);
});

test("buttonParamsJson rusak tidak bikin crash", () => {
  const out = dmSafe("628123@s.whatsapp.net", {
    text: "x",
    interactiveButtons: [{ name: "single_select", buttonParamsJson: "{rusak" }]
  });
  assert.equal(out.text, "x");
});

test("tombol legacy {id,text} ikut jadi teks", () => {
  const out = dmSafe("628123@s.whatsapp.net", { text: "HP kritis", buttons: [{ id: "heal", text: "Heal" }] });
  assert.match(out.text, /• Heal — !heal/);
});

test("footer ikut ke teks DM", () => {
  const out = dmSafe("628123@s.whatsapp.net", { text: "x", footer: "Zenyn v1.0", interactiveButtons: [cta] });
  assert.match(out.text, /Zenyn v1\.0$/);
});

test("actionLines: tanpa tombol = kosong", () => {
  assert.deepEqual(actionLines({ text: "x" }, "!"), []);
});
