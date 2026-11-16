'use strict'
// Engine `.iqc`: state builder selalu benar; render Chromium hanya diuji di Linux
// (binary @sparticuz/chromium tidak jalan di Windows), di sana harus PNG 880x1912.
const assert = require('node:assert/strict')
const { buildState, renderQuote, engineStatus, scale } = require('../lib/iqc-browser.js')

const png = (buf) => buf.subarray(0, 8).toString('hex') === '89504e470d0a1a0a'

;(async () => {
  const state = buildState('Halo dunia', { contact: 'Budi', outgoing: true, time: '21.04' })
  assert.equal(state.senderName, 'Budi')
  assert.equal(state.messages[0].sender, 'you')
  assert.equal(state.time, '21.04')
  assert.equal(state.quoteMessageId, 'msg_1')
  assert.equal(state.layout, '9:16')
  assert.equal(state.showSenderName, true)

  const incoming = buildState('Halo', { contact: 'Budi' })
  assert.equal(incoming.messages[0].sender, 'other')

  const status = await engineStatus()
  if (process.platform !== 'linux' || !status.ok) {
    console.log('skip render chromium (' + (process.platform !== 'linux' ? 'bukan linux' : status.problems.join(', ')) + ')')
    console.log('ok   iqc-browser: buildState valid, engine dilewati')
    console.log('ALL PASS')
    return
  }

  const t = Date.now()
  const buf = await renderQuote(state)
  const w = buf.readUInt32BE(16)
  const h = buf.readUInt32BE(20)
  assert.ok(png(buf), 'harus PNG')
  assert.equal(w, 440 * scale, 'lebar harus 440 x scale')
  assert.equal(h, 956 * scale, 'tinggi harus 956 x scale')
  assert.ok(Date.now() - t < 25000, 'render terlalu lama')

  console.log('ok   iqc-browser: buildState valid, chromium render ' + w + 'x' + h + ' dalam ' + (Date.now() - t) + 'ms')
  console.log('ALL PASS')
})().catch((err) => {
  console.error('FAIL', err.message)
  process.exit(1)
})
