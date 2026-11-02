/**
 * DDL TABEL: dipakai oleh /api/setup dan scripts/verify-sql.ts.
 * Semua statement aman dijalankan berulang (tidak pernah menghapus data).
 */
export const DDL = [
  // Satu baris = satu hari. Kolom null = belum diisi (sama seperti sel kosong di Excel).
  `CREATE TABLE IF NOT EXISTS daily_recaps (
      day date PRIMARY KEY,
      cash integer,
      qris_static integer,
      qris_dynamic integer,
      transfer integer,
      report_income integer,
      report_cash integer,
      talangan integer,
      talangan_source text,
      items jsonb NOT NULL DEFAULT '[]'::jsonb,
      updated_by text,
      updated_at timestamptz NOT NULL DEFAULT now()
   )`,
  // Bulan yang ada di tabel ini = terkunci (tidak bisa diubah sampai dibuka kuncinya).
  `CREATE TABLE IF NOT EXISTS month_locks (
      month_key text PRIMARY KEY,
      locked_by text,
      locked_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS settings (
      key text PRIMARY KEY,
      value text NOT NULL
   )`,
] as const;
