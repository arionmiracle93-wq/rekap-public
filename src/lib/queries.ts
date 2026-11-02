import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { db } from "@/db";
import { DEFAULT_MODAL, blankDay, resolveModal, SRC, type Day } from "@/lib/calc";

/** Semua query lewat `q` supaya scripts/verify-sql.ts bisa menggantinya dengan PGlite. */
type QDb = NodePgDatabase<Record<string, never>>;
let q: QDb = db;
export function setQueriesDb(target: QDb): void {
  q = target;
}

type Row = {
  day: string; cash: number | null; qris_static: number | null; qris_dynamic: number | null; transfer: number | null;
  report_income: number | null; report_cash: number | null; talangan: number | null; talangan_source: string | null; items: Day["items"] | null;
};

function toDays(rows: Row[]): Record<string, Day> {
  const days: Record<string, Day> = {};
  for (const r of rows) {
    days[r.day] = {
      cash: r.cash, qs: r.qris_static, qd: r.qris_dynamic, tf: r.transfer, lapM: r.report_income, lapS: r.report_cash,
      tal: r.talangan, sumber: r.talangan_source ?? blankDay().sumber, items: r.items ?? [],
    };
  }
  return days;
}

/** Semua hari terisi di antara dua tanggal (inklusif), untuk rekap tahunan / periode. */
export async function getRange(from: string, to: string): Promise<{ modals: Record<string, number>; days: Record<string, Day> }> {
  const res = await q.execute(sql`
    SELECT to_char(day, 'YYYY-MM-DD') AS day, cash, qris_static, qris_dynamic, transfer,
           report_income, report_cash, talangan, talangan_source, items
    FROM daily_recaps WHERE day BETWEEN ${from}::date AND ${to}::date ORDER BY day`);
  const { legacy, explicit } = await loadModals();
  const modals: Record<string, number> = {};
  for (const m of monthsBetween(from, to)) modals[m] = resolveModal(m, explicit, legacy);
  return { modals, days: toDays(res.rows as unknown as Row[]) };
}

/** Daftar bulan ("2026-01", ...) dari tanggal `from` sampai `to`. */
function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.slice(0, 7).split("-").map(Number);
  const end = to.slice(0, 7);
  for (;;) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    if (key > end) return out;
    out.push(key);
    if (++m > 12) { m = 1; y++; }
  }
}

/** Modal disimpan di tabel settings: "modal:2026-11" per bulan, plus "modal" (nilai lama versi sebelumnya, tidak diubah lagi). */
async function loadModals(): Promise<{ legacy: number; explicit: Record<string, number> }> {
  const r = await q.execute(sql`SELECT key, value FROM settings WHERE key = 'modal' OR key LIKE 'modal:%'`);
  let legacy = DEFAULT_MODAL;
  const explicit: Record<string, number> = {};
  for (const row of r.rows as unknown as { key: string; value: string }[]) {
    const v = Number(row.value);
    if (!Number.isFinite(v)) continue;
    if (row.key === "modal") legacy = v;
    else explicit[row.key.slice("modal:".length)] = v;
  }
  return { legacy, explicit };
}

export async function getModal(month: string): Promise<number> {
  const { legacy, explicit } = await loadModals();
  return resolveModal(month, explicit, legacy);
}

/** Pastikan bulan ini punya nilai modal sendiri (diisi dari nilai yang sedang berlaku), supaya tidak ikut bergeser kalau bulan lain diubah. */
async function ensureModal(month: string): Promise<void> {
  const key = `modal:${month}`;
  await q.execute(sql`INSERT INTO settings (key, value)
    SELECT ${key}, COALESCE(
      (SELECT value FROM settings WHERE key LIKE 'modal:%' AND key COLLATE "C" < ${key} COLLATE "C" ORDER BY key COLLATE "C" DESC LIMIT 1),
      (SELECT value FROM settings WHERE key = 'modal'),
      ${String(DEFAULT_MODAL)})
    ON CONFLICT (key) DO NOTHING`);
}

/** Bekukan modal semua bulan yang sudah punya data, dari yang paling lama. */
async function freezeModals(): Promise<void> {
  const r = await q.execute(sql`SELECT DISTINCT to_char(day, 'YYYY-MM') AS m FROM daily_recaps ORDER BY m`);
  for (const row of r.rows as unknown as { m: string }[]) await ensureModal(row.m);
}

/** Ubah modal satu bulan saja. Bulan lain yang sudah berisi data tidak ikut berubah. */
export async function setModal(month: string, value: number): Promise<void> {
  await freezeModals();
  await q.execute(sql`INSERT INTO settings (key, value) VALUES (${`modal:${month}`}, ${String(value)})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`);
}

/** Semua hari terisi dalam satu bulan ("2026-11") + modal kasir. */
export async function getMonth(month: string): Promise<{ modal: number; locked: boolean; days: Record<string, Day> }> {
  const start = `${month}-01`;
  const res = await q.execute(sql`
    SELECT to_char(day, 'YYYY-MM-DD') AS day, cash, qris_static, qris_dynamic, transfer,
           report_income, report_cash, talangan, talangan_source, items
    FROM daily_recaps
    WHERE day >= ${start}::date AND day < (${start}::date + interval '1 month')
    ORDER BY day`);
  const days = toDays(res.rows as unknown as Row[]);
  return { modal: await getModal(month), locked: await isLocked(month), days };
}

export async function saveDay(date: string, d: Day, actor: string | null): Promise<void> {
  await ensureModal(date.slice(0, 7));
  await q.execute(sql`
    INSERT INTO daily_recaps (day, cash, qris_static, qris_dynamic, transfer, report_income, report_cash,
                              talangan, talangan_source, items, updated_by, updated_at)
    VALUES (${date}::date, ${d.cash}, ${d.qs}, ${d.qd}, ${d.tf}, ${d.lapM}, ${d.lapS},
            ${d.tal}, ${d.tal != null ? d.sumber : SRC[0]}, ${JSON.stringify(d.items)}::jsonb, ${actor}, now())
    ON CONFLICT (day) DO UPDATE SET
      cash = EXCLUDED.cash, qris_static = EXCLUDED.qris_static, qris_dynamic = EXCLUDED.qris_dynamic,
      transfer = EXCLUDED.transfer, report_income = EXCLUDED.report_income, report_cash = EXCLUDED.report_cash,
      talangan = EXCLUDED.talangan, talangan_source = EXCLUDED.talangan_source, items = EXCLUDED.items,
      updated_by = EXCLUDED.updated_by, updated_at = now()`);
}

export async function deleteDay(date: string): Promise<void> {
  await q.execute(sql`DELETE FROM daily_recaps WHERE day = ${date}::date`);
}

export async function isLocked(month: string): Promise<boolean> {
  const r = await q.execute(sql`SELECT 1 FROM month_locks WHERE month_key = ${month}`);
  return r.rows.length > 0;
}

export async function setLock(month: string, locked: boolean, actor: string | null): Promise<void> {
  if (locked) {
    await q.execute(sql`INSERT INTO month_locks (month_key, locked_by) VALUES (${month}, ${actor}) ON CONFLICT (month_key) DO NOTHING`);
  } else {
    await q.execute(sql`DELETE FROM month_locks WHERE month_key = ${month}`);
  }
}

/** Tanggal yang sudah terisi di antara dua tanggal (untuk pratinjau impor). */
export async function existingDates(min: string, max: string): Promise<Set<string>> {
  const r = await q.execute(sql`SELECT to_char(day, 'YYYY-MM-DD') AS day FROM daily_recaps WHERE day BETWEEN ${min}::date AND ${max}::date`);
  return new Set((r.rows as unknown as { day: string }[]).map((x) => x.day));
}
