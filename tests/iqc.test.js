'use strict'
// `.iqc` render: real PNG, grows with text, rejects empty/oversized input.
const assert = require('node:assert/strict')
const { renderQuote, MAX_TEXT } = require('../lib/iqc.js')

const png = (buf) => buf.subarray(0, 8).toString('hex') === '89504e470d0a1a0a'
const size = async (text) => {
  const buf = await renderQuote(text, 'Asus')
  const w = buf.readUInt32BE(16)
  const h = buf.readUInt32BE(20)
  return { buf, w, h }
}

;(async () => {
  const short = await size('Halo dunia')
  assert.ok(png(short.buf), 'harus PNG')
  assert.equal(short.w, 900)
  assert.ok(short.buf.length > 10240, 'gambar terlalu kecil: ' + short.buf.length)

  const long = await size('Kata '.repeat(80))
  assert.ok(long.h > short.h, `tinggi harus bertambah (${short.h} -> ${long.h})`)

  await assert.rejects(() => renderQuote('   '), /Teks kosong/)
  await assert.rejects(() => renderQuote('x'.repeat(MAX_TEXT + 1)), /maksimal/)

  console.log('ok   iqc: png, tinggi dinamis, teks kosong & kepanjangan ditolak')
  console.log('ALL PASS')
})().catch((err) => {
  console.error('FAIL', err.message)
  process.exit(1)
})
