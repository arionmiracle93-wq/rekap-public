import ExcelJS from "exceljs";
import { SRC, cleanDay, hasContent, num, validDate, type Day } from "@/lib/calc";

type Field = "cash" | "qs" | "qd" | "tf" | "lapM" | "tal" | "sumber" | "lapS" | "itemName" | "itemAmt";
type Cols = { header: number; date: number } & Partial<Record<Field, number>>;

/** Posisi bawaan template asli, dipakai hanya kalau baris header ("Tanggal") tidak ditemukan. */
const FALLBACK: Cols = { header: 4, date: 1, cash: 3, qs: 4, qd: 5, tf: 6, lapM: 8, tal: 14, sumber: 15, lapS: 18, itemName: 10, itemAmt: 11 };
const DEFAULT_BLOCK = 6, MAX_ROWS = 20000, MAX_DAYS = 800;

function raw(c: ExcelJS.Cell): unknown {
  const v = c.value as unknown;
  return v && typeof v === "object" && !(v instanceof Date) && "result" in v ? (v as { result: unknown }).result : v;
}
function text(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (v && typeof v === "object" && "richText" in v) return (v as { richText: { text: string }[] }).richText.map((t) => t.text).join("").trim();
  return "";
}
function dateKey(v: unknown): string | null {
  if (v instanceof Date && !isNaN(+v)) return v.toISOString().slice(0, 10);
  const s = typeof v === "string" ? v.trim() : "";
  return validDate(s) ? s : null;
}

/** Kolom dikenali dari teks header, jadi urutan kolom boleh berubah. Kolom yang tidak ada di header diabaikan. */
function findColumns(ws: ExcelJS.Worksheet): Cols {
  for (let r = 1; r <= Math.min(ws.rowCount, 20); r++) {
    const cells: [number, string][] = [];
    ws.getRow(r).eachCell((c, col) => cells.push([col, text(raw(c)).toLowerCase()]));
    const date = cells.find(([, v]) => v === "tanggal");
    if (!date) continue;
    const find = (fn: (v: string) => boolean) => cells.find(([, v]) => fn(v))?.[0];
    return {
      header: r, date: date[0],
      cash: find((v) => v === "cash"),
      qs: find((v) => v.startsWith("qris statis")),
      qd: find((v) => v.startsWith("qris dinamis")),
      tf: find((v) => v === "transfer"),
      lapM: find((v) => v.startsWith("total pemasukan") && v.includes("laporan")),
      itemName: find((v) => v.startsWith("item")),
      itemAmt: find((v) => v.startsWith("nominal")),
      tal: find((v) => v.startsWith("talangan")),
      sumber: find((v) => v.startsWith("sumber")),
      lapS: find((v) => v.startsWith("saldo cash") && v.includes("laporan")),
    };
  }
  return FALLBACK;
}

function findModal(ws: ExcelJS.Worksheet, header: number): number | null {
  for (let r = 1; r < header; r++) {
    let label = -1, value: number | null = null;
    ws.getRow(r).eachCell((c, col) => {
      const v = raw(c);
      if (label < 0 && text(v).toLowerCase().startsWith("modal kasir")) label = col;
      else if (label >= 0 && value == null) value = num(v);
    });
    if (label >= 0) return value;
  }
  return num(raw(ws.getCell(3, 3)));
}

/**
 * Baca template Excel. Tiap hari = satu blok baris yang diawali sel tanggal; tinggi blok dihitung dari jarak ke
 * tanggal berikutnya, jadi jumlah baris pengeluaran per hari bebas (tidak harus 6).
 */
export async function parseTemplate(buf: ArrayBuffer | Uint8Array): Promise<{ days: Record<string, Day>; fileModal: number | null }> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(Buffer.from(buf as ArrayBuffer) as unknown as ExcelJS.Buffer);
  } catch {
    throw new Error("File bukan .xlsx yang valid.");
  }
  const ws = wb.getWorksheet("Rekap Harian") ?? wb.worksheets[0];
  if (!ws) throw new Error("Sheet tidak ditemukan.");

  const cols = findColumns(ws);
  const last = Math.min(ws.rowCount, cols.header + MAX_ROWS);
  const starts: { row: number; key: string }[] = [];
  for (let r = cols.header + 1; r <= last && starts.length < MAX_DAYS; r++) {
    const cell = ws.getCell(r, cols.date);
    if (cell.isMerged && cell.master.address !== cell.address) continue; // sel tanggal yang di-merge per blok: hanya sel utama
    const key = dateKey(raw(cell));
    if (key) starts.push({ row: r, key });
  }

  const at = (r: number, col?: number) => (col ? raw(ws.getCell(r, col)) : undefined);
  const days: Record<string, Day> = {};
  starts.forEach(({ row, key }, i) => {
    const height = i + 1 < starts.length ? starts[i + 1].row - row : i > 0 ? row - starts[i - 1].row : DEFAULT_BLOCK;
    const end = Math.min(row + height - 1, ws.rowCount);
    const items: { n: string; v: unknown }[] = [];
    for (let r = row; r <= end; r++) {
      if (r > row && text(raw(ws.getCell(r, cols.date)))) break; // baris TOTAL / catatan di bawah data
      items.push({ n: text(at(r, cols.itemName)), v: at(r, cols.itemAmt) });
    }
    const sumber = text(at(row, cols.sumber)).toLowerCase();
    const d = cleanDay({
      cash: at(row, cols.cash), qs: at(row, cols.qs), qd: at(row, cols.qd), tf: at(row, cols.tf),
      lapM: at(row, cols.lapM), tal: at(row, cols.tal), lapS: at(row, cols.lapS),
      sumber: SRC.find((s) => s.toLowerCase() === sumber) ?? SRC[0], items,
    });
    if (hasContent(d)) days[key] = d;
  });
  return { days, fileModal: findModal(ws, cols.header) };
}
