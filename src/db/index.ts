import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

type Db = NodePgDatabase<Record<string, never>>;

const globalForDb = globalThis as typeof globalThis & {
  __rekapKasPgPool?: Pool;
  __rekapKasDb?: Db;
};

/** Ambil DATABASE_URL tanpa melempar error (supaya halaman tetap bisa menjelaskan masalah). */
export function databaseUrl(): string | null {
  const raw = process.env.DATABASE_URL;
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function databaseHost(): string | null {
  const url = databaseUrl();
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

export function isLocalDatabase(host: string | null): boolean {
  if (!host) return true;
  return /^(localhost|127\.0\.0\.1|::1|\[::1\])/.test(host);
}

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super(
      "DATABASE_URL belum diisi. Tambahkan Environment Variable DATABASE_URL di Vercel (Settings → Environment Variables), lalu Redeploy.",
    );
    this.name = "DatabaseNotConfiguredError";
  }
}

function createDb(): Db {
  const url = databaseUrl();
  if (!url) throw new DatabaseNotConfiguredError();

  const host = databaseHost();
  const needsSsl = !isLocalDatabase(host) && !/sslmode=/.test(url);

  const pool =
    globalForDb.__rekapKasPgPool ??
    new Pool({
      connectionString: url,
      // Vercel menjalankan beberapa instance sekaligus. Pool terlalu besar bisa
      // membanjiri Neon dengan koneksi; terlalu kecil bikin antre. 6 aman untuk
      // aplikasi kecil-kecilan ini, jauh dari batas koneksi Neon.
      max: 6,
      min: 0,
      idleTimeoutMillis: 30_000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10_000,
      // Neon/Vercel butuh koneksi terenkripsi. Kalau user lupa menambah
      // `?sslmode=require`, kita nyalakan SSL otomatis (kecuali localhost).
      ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
      connectionTimeoutMillis: 15_000,
    });

  globalForDb.__rekapKasPgPool = pool;
  return drizzle(pool);
}

/**
 * Proxy "lembut": kalau DATABASE_URL belum ada, aplikasi tidak crash di level modul
 * (yang menyebabkan layar hitam), tapi melempar pesan yang bisa dibaca manusia
 * ketika query pertama dijalankan — sehingga halaman error kustom bisa tampil.
 */
function lazyDb(): Db {
  const target = {} as Db;
  return new Proxy(target, {
    get(_prop, key) {
      if (!globalForDb.__rekapKasDb) globalForDb.__rekapKasDb = createDb();
      const instance = globalForDb.__rekapKasDb;
      const value = Reflect.get(instance as object, key, instance);
      return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(instance) : value;
    },
  });
}

export const db: Db = databaseUrl() ? createDb() : lazyDb();
