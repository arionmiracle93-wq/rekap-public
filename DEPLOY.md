# Deploy ke Vercel

## Environment Variables (wajib)

Set di **Vercel → Project → Settings → Environment Variables** untuk Production, Preview, dan Development:

| Name | Contoh | Keterangan |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://user:pass@host/db?sslmode=require` | Connection string Postgres (Neon/Supabase/Vercel Postgres) |
| `APP_PASSWORD` | `rahasia123` | Kata sandi login, minimal 4 karakter |
| `SESSION_SECRET` | string acak panjang | Opsional tapi disarankan (penguat tanda tangan cookie) |
| `SETUP_TOKEN` | string acak | Opsional; kalau diisi, buka `/api/setup?token=...` |

Jangan mengisi `NODE_ENV=production` sebagai environment variable. Vercel sudah mengaturnya saat build,
dan kalau diisi manual sebagian tool bisa melewati devDependencies.

## Urutan deploy

1. Push repo → import di Vercel → framework terdeteksi **Next.js** (biarkan Build Command `npm run build`).
2. Isi environment variables di atas, lalu **Redeploy**.
3. Buka `https://domain-kamu/api/setup` sekali untuk membuat tabel (`daily_recaps`, `month_locks`, `settings`).
4. Buka `/login`, masuk pakai `APP_PASSWORD` + nama kasir.

## Pengaturan yang dipakai project ini

- `vercel.json` → `installCommand: npm install --include=dev` (memaksa devDependencies ikut terpasang).
- Paket yang dibutuhkan saat build (`typescript`, `postcss`, `tailwindcss`, `@tailwindcss/postcss`, `@types/*`)
  sudah dipindah ke `dependencies`, jadi build tetap jalan walau devDependencies dilewati.
- `.nvmrc` → Node 22 (Next.js 16 butuh Node >= 20.9).
- `start` & `build` memakai environment `production`; tidak ada query database saat build,
  jadi `DATABASE_URL` kosong/salah tidak menggagalkan build (hanya runtime).

## Kalau build masih gagal

Buka **Vercel → Deployments → (deployment gagal) → Building**, lalu cari baris `Error:`.
Beberapa penyebab umum:

| Gejala di log | Penyebab | Solusi |
| --- | --- | --- |
| `Cannot find module '@tailwindcss/postcss'` | devDependencies dilewati | Pastikan `vercel.json` ikut ter-push; cek tidak ada `NODE_ENV=production` di env |
| `No package.json found` | Root Directory salah | Settings → Root Directory = `.` |
| `Module not found: Can't resolve 'exceljs'` | dependency belum ter-install / lockfile lama | Commit `package.json` + `package-lock.json` terbaru, redeploy |
| `Node.js version ... not supported` | Node terlalu tua | Settings → Node.js Version = 22.x (atau ikuti `.nvmrc`) |
| `relation "daily_recaps" does not exist` (runtime) | Belum setup DB | Buka `/api/setup` sekali |

## Cek cepat setelah deploy

- `GET /api/health` → `{"ok":true}` (tanpa login).
- Login → tab **Ringkasan/Pengaturan** → **Ekspor Excel (.xlsx)** → file harus punya sheet
  `Rekap Harian` + `Ringkasan` dengan warna/rumus seperti template.
