'use strict'
// `!gw model` formatting: routing chain from /admin/upstreams + today's tokens
// from /admin/models, merged without touching the network (global.fetch stubbed).
const assert = require('node:assert/strict')

process.env.GW_ADMIN_KEY = 'test'
process.env.GW_ADMIN_URL = 'http://127.0.0.1:1'

const gw = require('../commands/owner/gw.js')

const routes = {
  upstreams: [
    { name: 'freeai', keys: 1, models: 1, cooling_s: 0 },
    { name: 'netraux', keys: 1, models: 2, cooling_s: 120 },
  ],
  models: {
    'prem/glm-5.3-flash': [
      { upstream: 'freeai', model: 'prem/glm-5.3-flash' },
      { upstream: 'netraux', model: 'free/glm-5.3-flash' },
    ],
    'free/gpt-6-luna': [{ upstream: 'netraux', model: 'free/gpt-6-luna' }],
  },
}
const usage = {
  since: '2026-11-16T00:00:00.000Z',
  models: [{ model: 'free/gpt-6-luna', requests: 9, prompt_tokens: 8000, completion_tokens: 4345, errors: 0, tokens: 12345 }],
}

const run = async (routesBody, usageBody) => {
  global.fetch = async (url) => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(String(url).includes('/admin/models') ? usageBody : routesBody),
  })
  const sent = []
  const client = { sendMessage: async (jid, payload) => (sent.push(String(payload.text)), {}) }
  const message = { key: { remoteJid: '62895327668200@s.whatsapp.net' }, pushName: 'Owner' }
  await gw.run(client, message, ['model'], {})
  return sent.join('\n')
}

;(async () => {
  const text = await run(routes, usage)
  assert.match(text, /MODEL — HARI INI/)
  assert.match(text, /total terpakai: 12\.345 token · 9 req/)
  assert.match(text, /2\. netraux → free\/glm-5\.3-flash ⛔2m/)
  assert.match(text, /1\. freeai → prem\/glm-5\.3-flash\n/)
  // used model first, unused ones after it
  assert.ok(text.indexOf('free/gpt-6-luna') < text.indexOf('prem/glm-5.3-flash'))
  assert.match(text, /2 model · 2 upstream · sejak/)

  const empty = await run({ upstreams: [], models: {} }, { since: null, models: [] })
  assert.match(empty, /Belum ada model dirutekan\./)

  console.log('ok   gw model: token hari ini, rantai upstream, cooldown, urutan, kosong')
  console.log('ALL PASS')
})().catch((err) => {
  console.error('FAIL', err.message)
  process.exit(1)
})
