# Command `.agent`

Command `.agent` menjalankan agent dev otomatis di dalam repo bot. Agent hanya boleh mengubah file lewat tool yang diizinkan dan dibatasi oleh *path jail*.

## Contoh perintah

```
.agent tambahkan command ping di commands/general/ping.js
.agent perbaiki typo di lib/helper.js
.agent --deploy buat tests/agent.test.js untuk validasi path jail
```

- Tanpa flag: agent hanya menulis/mengubah file dan menjalankan pengecekan syntax.
- `--deploy`: setelah perubahan selesai, agent boleh menjalankan tes (`node --test`) dan melakukan `git add` + `git commit` untuk hasil kerjanya.

## Mode `--deploy`

1. Agent menyelesaikan semua perubahan file.
2. Syntax tiap file `.js` yang ditulis otomatis dicek (`node --check`).
3. Jika ada tes terkait, dijalankan dengan `node --test <file>`.
4. Bila semua lolos, perubahan di-commit dengan pesan ringkas.
5. Jika gagal, agent wajib memperbaiki atau melaporkan error tanpa commit.

## Batasan

- **Path jail**: agent hanya boleh membaca/menulis di dalam root repo. Path absolut, `..`, atau keluar dari root ditolak.
- **Direktori terlarang**: `.env`, `session/`, `database/`, `node_modules/` tidak boleh disentuh.
- **Whitelist command**: hanya `node --check`, `node --test`, dan `git status|diff|log|show|add|commit` yang diizinkan. Perintah shell lain ditolak.
- **Rollback**: setiap perubahan dicatat. Jika terjadi error atau tes gagal, agent mengembalikan file ke kondisi sebelumnya (restore dari backup/`git checkout -- <file>`) sebelum melaporkan kegagalan.
- **Satu permintaan = satu fitur**: agent tidak melakukan refactor besar atau mengubah file di luar permintaan.
