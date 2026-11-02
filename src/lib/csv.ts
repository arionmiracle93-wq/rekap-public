import { HARI, calc, type Day } from "@/lib/calc";

type Cell = string | number | null;

/** Sel teks yang diawali = + - @ diberi tanda kutip supaya tidak dibaca Excel sebagai rumus. */
function cell(v: Cell): string {
  if (v == null) return "";
  if (typeof v === "number") return String(v);
  const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const sum = (xs: (number | null)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0);

/** CSV dengan pemisah ";" + BOM UTF-8: langsung rapi saat dibuka di Excel versi Indonesia. */
export function buildCsv(modal: number | Record<string, number>, days: Record<string, Day>): string {
  const modalOf = (k: string) => (typeof modal === "number" ? modal : modal[k.slice(0, 7)] ?? 0);
  const head = ["Tanggal", "Hari", "Cash", "QRIS Statis", "QRIS Dinamis", "Transfer", "Total Pemasukan", "Total Pemasukan (laporan)", "Selisih Total",
    "Pengeluaran", "Total Pengeluaran", "Modal Awal", "Talangan", "Sumber Talangan", "Uang di Laci", "Saldo Cash", "Saldo Cash (laporan)", "Selisih Saldo"];
  const keys = Object.keys(days).sort();
  const calcs = keys.map((k) => calc(days[k], modalOf(k)));
  const rows: Cell[][] = keys.map((k, i) => {
    const d = days[k], c = calcs[i];
    const items = d.items.map((it) => `${it.n || "Tanpa keterangan"} ${it.v ?? ""}`.trim()).join(" | ");
    return [k, HARI[new Date(`${k}T00:00:00Z`).getUTCDay()], d.cash, d.qs, d.qd, d.tf, c.masuk, d.lapM, c.selM,
      items, c.keluar, c.has ? modalOf(k) : null, d.tal, d.tal ? d.sumber : null, c.laci, c.saldo, d.lapS, c.selS];
  });
  rows.push(["TOTAL", "", sum(keys.map((k) => days[k].cash)), sum(keys.map((k) => days[k].qs)), sum(keys.map((k) => days[k].qd)), sum(keys.map((k) => days[k].tf)),
    sum(calcs.map((c) => c.masuk)), null, null, "", sum(calcs.map((c) => c.keluar)), null, sum(keys.map((k) => days[k].tal)), null, null, null, null, null]);
  return "\uFEFF" + [head, ...rows].map((r) => r.map(cell).join(";")).join("\r\n") + "\r\n";
}
