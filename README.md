# Rekap Kas Harian

Versi web dari template Excel "Rekap Kas". Stack: Next.js 16 (App Router) + React 19 + Tailwind 4 + Drizzle/pg + Neon PostgreSQL + Vercel.

## Isi
Tampilan mobile-first (gelap/terang). Di layar desktop (lebar ≥ 1024px) menu bawah otomatis jadi sidebar kiri dan isi halaman dibuat 2 kolom. 5 menu: **Beranda** (dashboard bulan ini), **Kalender** (titik status per tanggal, ketuk tanggal untuk lihat atau isi), **Detail** (tabel lengkap semua kolom seperti sheet Excel, dengan baris TOTAL; ketuk tanggal untuk buka rekap), **Ringkasan** (per Bulan, per Tahun dengan tren 12 bulan, atau Periode bebas dengan pilihan tanggal; bisa diekspor Excel `.xlsx` maupun CSV), **Pengaturan** (modal, tema, kunci bulan, ekspor Excel & CSV, impor). Tombol **+** membuka panel isi rekap dari bawah.

- **Harian**: daftar tanggal sebulan, ketuk satu hari untuk isi pemasukan (Cash, QRIS Statis, QRIS Dinamis, Transfer), pengeluaran dengan baris yang bisa ditambah lewat tombol + (maks. 30 item), talangan + sumbernya, dan angka laporan. Selisih dan uang di laci dihitung otomatis.
- **Ringkasan**: total per bulan, talangan per sumber, pengeluaran per keterangan (nama sama otomatis digabung).
- **Ekspor Excel (.xlsx)**: tombol "Ekspor Excel" mengunduh file `.xlsx` dengan format persis seperti template asli (`Rekap Harian` + `Ringkasan`, lengkap dengan merge baris per tanggal, warna biru/krem kolom input, rumus otomatis Excel `SUM`/`SUMIF`/`IF`, baris `TOTAL`, dan daftar pengeluaran per keterangan). File hasil ekspor juga bisa langsung diimpor kembali.
- **Ekspor CSV**: tombol "Ekspor CSV" mengunduh rekap bulan atau periode yang sedang dibuka (pemisah `;`, langsung rapi di Excel Indonesia).
- **Impor Excel**: tombol "Impor dari Excel" membaca template `.xlsx` (sheet "Rekap Harian"; jumlah baris pengeluaran per hari bebas, kolom dikenali dari teks header), tampil pratinjau dulu sebelum disimpan. Hari yang sama ditimpa.
- **Modal kasir per bulan**: diatur di Pengaturan untuk bulan yang sedang dibuka. Mengubah modal satu bulan tidak menggeser bulan lain; bulan baru otomatis memakai modal bulan sebelumnya; bulan terkunci tidak bisa diubah modalnya. Data dari versi lama (satu modal global) dibekukan otomatis saat modal pertama kali diubah. Disimpan di tabel `settings` (kunci `modal:YYYY-MM`), jadi tidak perlu membuka `/api/setup` lagi.
- **Kunci bulan**: setelah tutup kas, bulan bisa dikunci; hari tidak bisa diubah, dikosongkan, atau ditimpa impor sampai kunci dibuka.
- Login: satu kata sandi (`APP_PASSWORD`) + nama kasir, nama tercatat di kolom `updated_by`.

## Cara pasang
1. Buat database di Neon, salin connection string **Pooled**.
2. Upload proyek ke GitHub, import ke Vercel.
3. Isi Environment Variables: `DATABASE_URL`, `APP_PASSWORD` (lihat `.env.example`).
4. Deploy, lalu buka `https://domain-anda/api/setup` **sekali** untuk membuat tabel. (Aman diulang. Tabel juga otomatis disiapkan saat query pertama dijalankan.)
5. Buka halaman utama, masuk dengan nama dan kata sandi.

## Lokal
```
cp .env.example .env   # isi DATABASE_URL dan APP_PASSWORD
npm install
npm run dev
npm test               # typecheck + lint + uji SQL & Excel (PGlite)
```

## Struktur
- `src/lib/calc.ts`: rumus (sama dengan Excel), murni tanpa DB
- `src/lib/xlsx.ts`: pembuat file Excel `.xlsx` sesuai format persis template (`Rekap Harian` + `Ringkasan`)
- `src/lib/csv.ts`: pembuat file CSV (pemisah `;`)
- `src/lib/importXlsx.ts`: pembaca/impor template `.xlsx`
- `src/lib/ddl.ts` + `/api/setup`: pembuat tabel (`daily_recaps`, `month_locks`, `settings`)
- `src/lib/queries.ts`: semua query SQL
- `src/app/api/{month,day,settings,lock,range,export,import}`: API, `src/proxy.ts`: gerbang login
- `src/components/RekapApp.tsx`: seluruh tampilan
