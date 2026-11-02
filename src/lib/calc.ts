/** Logika hitung: sama persis dengan rumus di template Excel. Murni, tanpa akses DB. */
export const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
export const BLN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
export const SRC = ["Uang pribadi", "Owner", "Rekening toko"] as const;

export const MAX_ITEMS = 30; // batas item pengeluaran per hari

export type Item = { n: string; v: number | null };
export type NumKey = "cash" | "qs" | "qd" | "tf" | "lapM" | "lapS" | "tal";
export type Day = Record<NumKey, number | null> & { sumber: string; items: Item[] };
export const NUM_KEYS: NumKey[] = ["cash", "qs", "qd", "tf", "lapM", "lapS", "tal"];

export const fmt = (n: number) => new Intl.NumberFormat("id-ID").format(n);
export const rp = (n: number | null) => (n == null ? "–" : `${n < 0 ? "−" : ""}Rp ${fmt(Math.abs(n))}`);

export function num(v: unknown): number | null {
  if (v === "" || v == null) return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && Math.abs(n) <= 2_000_000_000 ? n : null;
}

export function blankDay(): Day {
  return { cash: null, qs: null, qd: null, tf: null, lapM: null, lapS: null, tal: null, sumber: SRC[0], items: [] };
}

/** Bersihkan input dari browser sebelum disimpan. */
export function cleanDay(raw: unknown): Day {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = blankDay();
  for (const k of NUM_KEYS) d[k] = num(r[k]);
  d.sumber = (SRC as readonly string[]).includes(String(r.sumber)) ? String(r.sumber) : SRC[0];
  d.items = (Array.isArray(r.items) ? r.items : [])
    .slice(0, MAX_ITEMS)
    .map((i) => {
      const o = (i && typeof i === "object" ? i : {}) as Record<string, unknown>;
      return { n: String(o.n ?? "").trim().slice(0, 60), v: num(o.v) };
    })
    .filter((i) => i.n || i.v != null);
  return d;
}

export function calc(d: Day | undefined, modal: number) {
  const inc = d ? [d.cash, d.qs, d.qd, d.tf].filter((x): x is number => x != null) : [];
  const out = d ? d.items.map((i) => i.v).filter((x): x is number => x != null) : [];
  const has = inc.length > 0 || out.length > 0;
  const cash = d?.cash ?? 0;
  const masuk = inc.length ? inc.reduce((a, b) => a + b, 0) : null;
  const keluar = out.length ? out.reduce((a, b) => a + b, 0) : null;
  const saldo = has ? cash - (keluar ?? 0) : null;
  return {
    has,
    masuk,
    keluar,
    saldo,
    tal: d?.tal ?? 0,
    cash,
    laci: has ? modal + cash - (keluar ?? 0) + (d?.tal ?? 0) : null,
    selM: masuk != null && d?.lapM != null ? masuk - d.lapM : null,
    selS: saldo != null && d?.lapS != null ? saldo - d.lapS : null,
  };
}

export const DEFAULT_MODAL = 200_000;

/**
 * Modal sebuah bulan ("2026-11"): nilai bulan itu sendiri; kalau belum ada, ikut bulan terdekat sebelumnya;
 * kalau tidak ada juga, pakai nilai lama (satu angka global dari versi sebelumnya).
 */
export function resolveModal(month: string, explicit: Record<string, number>, legacy: number): number {
  if (month in explicit) return explicit[month];
  let best: string | null = null;
  for (const m of Object.keys(explicit)) if (m < month && (best === null || m > best)) best = m;
  return best === null ? legacy : explicit[best];
}

/** Status tampilan per hari: null = kosong, "bad" = laci minus, "warn" = ada selisih dengan laporan. */
export const status = (c: ReturnType<typeof calc>) => (!c.has ? null : (c.laci ?? 0) < 0 ? "bad" : c.selM || c.selS ? "warn" : "ok");

/** Hari layak disimpan kalau ada isinya sama sekali. */
export const hasContent = (d: Day) => calc(d, 0).has || d.lapM != null || d.lapS != null || d.tal != null;

export const validDate = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/** Rentang valid: awal <= akhir dan maksimal ~2 tahun. */
export const rangeOk = (from: string, to: string) => from <= to && (Date.parse(to) - Date.parse(from)) / 864e5 <= 800;
