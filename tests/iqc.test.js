'use strict'
// `.iqc` render: PNG 880x1912 dengan sukses, latar gelap dominan, bubble
// masuk vs keluar berbeda, dan input kosong/kepanjangan ditolak.
const assert = require('node:assert/strict')
const sharp = require('sharp')
const { renderQuote, MAX_TEXT, W, H } = require('../lib/iqc.js')

const png = (buf) => buf.subarray(0, 8).toString('hex') === '89504e470d0a1a0a'

const stats = async (buf) => {
  const meta = await sharp(buf).metadata()
  const { data, info } = await sharp(buf).greyscale().raw().toBuffer({ resolveWithObject: true })
  let sum = 0
  let bright = 0
  for (const v of data) {
    sum += v
    if (v > 200) bright++
  }
  return { w: meta.width, h: meta.height, avg: sum / data.length, bright, px: info.width * info.height }
}

;(async () => {
  const incoming = await renderQuote('Halo, ini quote chat gaya iPhone dari Zenyn.', { contact: 'Budi', battery: 85 })
  assert.ok(png(incoming), 'harus PNG')

  const s = await stats(incoming)
  assert.equal(s.w, W * 2, 'lebar 880')
  assert.equal(s.h, H * 2, 'tinggi 1912')
  assert.ok(s.avg < 120, 'latar harus gelap, avg=' + s.avg.toFixed(1))
  assert.ok(s.bright > 2000, 'teks terang harus tergambar, bright=' + s.bright)

  const outgoing = await renderQuote('Halo, ini quote chat gaya iPhone dari Zenyn.', { contact: 'Budi', outgoing: true })
  assert.notEqual(Buffer.compare(incoming, outgoing), 0, 'bubble kanan harus beda dari kiri')

  await assert.rejects(() => renderQuote('   '), /Teks kosong/)
  await assert.rejects(() => renderQuote('x'.repeat(MAX_TEXT + 1)), /maksimal/)

  console.log('ok   iqc: png 880x1912, latar gelap, teks tergambar, in != out, validasi input')
  console.log('ALL PASS')
})().catch((err) => {
  console.error('FAIL', err.message)
  process.exit(1)
})
