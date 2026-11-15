# Command `.agent`

Command `.agent` menjalankan dev agent (LLM) yang bisa membuat, mengubah, dan memperbaiki fitur bot langsung di repo. Khusus owner (`isOwner`).

## Contoh perintah

```
.agent buatin fitur cuaca pakai wttr.in
.agent update fitur premium: tambah paket 90 hari
.agent fix bcgc footer salah tanggal
.agent --deploy fix typo di lib/rpglimit.js
```

- Tanpa flag: agent menulis file + cek syntax + commit. Bot **tidak** di-restart.
- `--deploy`: sama seperti di atas, ditambah `git push origin main` lalu bot restart otomatis.

## Alur kerja

1. Repo wajib bersih; kalau ada perubahan belum di-commit, agent menolak jalan (rollback butuh titik aman).
2. Agent loop maks `AGENT_MAX_STEPS` langkah (default 12) dalam batas `AGENT_DEADLINE_MS` (default 180s).
3. Tiap balasan model harus satu objek JSON: `{"tool":"...","args":{...}}` atau `{"done":true,"summary":"..."}`.
4. Setiap file `.js` yang ditulis langsung diuji `node --check`; gagal → file dipulihkan dan error dikirim balik ke model.
5. Setelah loop: semua file `.js` yang berubah dicek ulang. Kalau ada yang rusak, seluruh perubahan di-rollback (`git reset --hard HEAD`).
6. Tes yang ikut berubah (`tests/*.js`) dijalankan dengan `node --test`.
7. Kalau ada perubahan valid: `git add -A` + `git commit`. Dengan `--deploy` lanjut `git push` + `pm2 restart`.

## Tool

| Tool | Args | Isi |
|---|---|---|
| `list_files` | `{dir, limit}` | daftar file repo |
| `read_file` | `{path, offset, limit}` | baca file, maks 400 baris |
| `write_file` | `{path, content}` | tulis/timpa file |
| `run` | `{cmd}` | command whitelist |

## Batasan

- **Path jail**: hanya di dalam root repo. `..`, path absolut, dan karakter shell ditolak.
- **Diblokir**: `.env`, `session/`, `database/`, `node_modules/`, `.git/`, `backup/`, `ex/`.
- **Whitelist command**: `node --check <file>`, `node --test <file...>`, `git status|diff|log|show|add|commit|rev-parse`. Tanpa shell (`shell: false`), operator `; | & > < $ \`` ditolak.
- **Satu agent sekaligus**: lock `.agent.lock`, run kedua ditolak.
- **Satu permintaan = satu fitur**: tidak untuk refactor besar.

## Env

```
AGENT_API_KEY=sk-...
AGENT_MODEL=prem/deepseek-v4.1-flash-1017
AGENT_MODEL_FALLBACK=ovh-free/gpt-oss-120b
AGENT_BASE=https://free.ai.id/v1
AGENT_MAX_STEPS=12
AGENT_DEADLINE_MS=180000
```
