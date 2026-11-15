# Command `.agent`

Dev agent (LLM) yang bisa membuat, mengubah, dan memperbaiki fitur bot langsung di repo. Khusus owner (`isOwner`).

## Contoh perintah

```
.agent buatin fitur cuaca pakai wttr.in
.agent update fitur premium: tambah paket 90 hari
.agent fix bcgc footer salah tanggal
.agent --deploy fix typo di lib/rpglimit.js
.agent lanjutkan
.agent status
.agent batal --yes
```

- Tanpa flag: agent menulis file + cek syntax + commit. Bot **tidak** di-restart.
- `--deploy`: ditambah `git push origin main` lalu bot restart otomatis.
- `lanjutkan`: melanjutkan pekerjaan yang berhenti di tengah (state di `.agent-state.json`).
- `status`: lihat pekerjaan tertunda.
- `batal --yes`: buang state + `git reset --hard` ke titik awal run tersebut.

## Alur

1. Run baru: repo wajib bersih (kalau kotor, agent menolak — rollback butuh titik aman).
2. Loop maks `AGENT_MAX_STEPS` langkah (default 12) dalam `AGENT_DEADLINE_MS` (default 900000 = 15 menit).
3. Tiap balasan model = satu objek JSON: `{"tool":"...","args":{...}}` atau `{"done":true,"summary":"..."}`.
4. Setiap `write_file` `.js` langsung `node --check`; gagal → file dipulihkan dan error dikirim balik ke model.
5. Setelah loop: semua `.js` yang berubah dicek ulang. Ada yang rusak → seluruh perubahan di-rollback (`git reset --hard HEAD`).
6. Tes yang ikut berubah (`tests/*.js`) dijalankan dengan `node --test`.
7. Ada perubahan valid + selesai → `git add -A` + `git commit`; dengan `--deploy` lanjut `git push` + `pm2 restart`.
8. Berhenti di tengah (langkah habis / batas waktu / LLM error) → state disimpan, file dibiarkan **belum di-commit**, laporan menyuruh `.agent lanjutkan`.

## Retry & rotasi model

- Model dipakai bergiliran (`AGENT_MODELS`), tiap percobaan pindah model.
- Default urutan: `prem/deepseek-v4.1-flash-1017` → `prem/minimax-m2.7` → `prem/glm-5.3-flash`.
- Retry `AGENT_RETRY_MAX` (50) dengan jeda `AGENT_RETRY_DELAY_MS` (15000 ms) hanya untuk `insufficient_funds`, 429, 5xx, timeout.
- `401`/key salah dan `400` body salah tidak diretry.
- Retry hanya mengulang panggilan LLM, bukan tool — file tidak pernah ditulis dua kali.

## Tool

| Tool | Args | Isi |
|---|---|---|
| `list_files` | `{dir, limit}` | daftar file repo |
| `read_file` | `{path, offset, limit}` | baca file, maks 400 baris |
| `write_file` | `{path, content}` | tulis/timpa file |
| `run` | `{cmd}` | command whitelist |

## Batasan

- **Path jail**: hanya di dalam root repo. `..`, path absolut, karakter shell ditolak.
- **Diblokir**: `.env`, `session/`, `database/`, `node_modules/`, `.git/`, `backup/`, `ex/`, `.agent-state.json`.
- **Whitelist command**: `node --check <file>`, `node --test <file...>`, `git status|diff|log|show|add|commit|rev-parse`. Tanpa shell (`shell: false`).
- **Satu agent sekaligus**: lock `.agent.lock`; run kedua ditolak.
- **Satu permintaan = satu fitur**.

## Env

```
AGENT_API_KEY=sk-...
AGENT_MODELS=prem/deepseek-v4.1-flash-1017,prem/minimax-m2.7,prem/glm-5.3-flash
AGENT_BASE=https://free.ai.id/v1
AGENT_RETRY_MAX=50
AGENT_RETRY_DELAY_MS=15000
AGENT_MAX_STEPS=12
AGENT_DEADLINE_MS=900000
```

`AGENT_MODEL` + `AGENT_MODEL_FALLBACK` masih dibaca kalau `AGENT_MODELS` kosong.
