'use strict'
// `.vps`: formatter never leaks IP/user/secret, and collect() really reads the host.
const assert = require('node:assert/strict')
const { collect, formatVps } = require('../lib/vps.js')

const fixture = {
  os: 'Debian GNU/Linux 12 (bookworm)',
  kernel: '7.0.14-26-pve',
  uptime_s: 1296000,
  cores: 1,
  load: [0.79, 0.43, 0.35],
  cpu_pct: 12,
  mem_total_mb: 2048,
  mem_used_mb: 229,
  mem_avail_mb: 1818,
  swap_total_mb: 512,
  swap_used_mb: 22,
  disk_total_b: 10.5 * 1024 ** 3,
  disk_used_b: 4.7 * 1024 ** 3,
  gateway: 'active',
  bot: { status: 'online', restarts: 69, mem_mb: 84 },
}

;(async () => {
  const text = formatVps(fixture)
  for (const field of ['VPS STATUS', 'uptime', 'RAM', 'disk /', 'gateway', 'active', 'bot', 'online']) {
    assert.ok(text.includes(field), 'field hilang: ' + field)
  }
  assert.ok(text.includes('229 MB / 2048 MB (11%)'), text)
  assert.ok(text.includes('online · restart 69 · 84 MB'))

  assert.ok(!/\b\d{1,3}(\.\d{1,3}){3}\b/.test(text), 'ada IPv4 di output')
  assert.ok(!/password|passwd|root@|ssh|apiKey|sk-/i.test(text), 'ada kata sensitif di output')

  // live read only makes sense on the Linux VPS; Windows has no /proc
  if (process.platform === 'linux') {
    const live = await collect()
    assert.ok(live.mem_total_mb > 0, 'RAM total tidak terbaca')
    assert.ok(live.disk_total_b > 0, 'disk tidak terbaca')
    assert.ok(live.cores > 0 && live.gateway, 'core/gateway tidak terbaca')
    const liveText = formatVps(live)
    assert.ok(!/\b\d{1,3}(\.\d{1,3}){3}\b/.test(liveText), 'output live membocorkan IPv4')
  }

  console.log('ok   vps: format lengkap, tanpa IP/secret' + (process.platform === 'linux' ? ', collect() baca host nyata' : ', collect() dilewati (bukan linux)'))
  console.log('ALL PASS')
})().catch((err) => {
  console.error('FAIL', err.message)
  process.exit(1)
})
