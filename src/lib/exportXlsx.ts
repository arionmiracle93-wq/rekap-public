import ExcelJS from "exceljs";
import { BLN, type Day } from "@/lib/calc";

/**
 * Pembuat file .xlsx ekspor: formatnya dibuat persis seperti template Rekap Kas
 * (Rekap_Kas_Nov_2026.xlsx) — layout 6 baris per hari, kolom input krem,
 * kolom rumus hitam, TOTAL, Ringkasan, conditional format, dan dropdown sumber talangan.
 * Rumus ditulis hidup (bukan angka mati) supaya file-nya bekerja seperti template.
 */

export type XlsxMonth = { month: string; modal: number; days: Record<string, Day> };

const C = {
  navy: "FF1F4E78", // biru gelap header & judul
  white: "FFFFFFFF",
  cream: "FFFFFBE6", // area input
  blue: "FF0000FF", // teks area input
  light: "FFDDEBF7", // baris TOTAL / total ringkasan
  yellow: "FFFFFF00", // sel modal
  gray: "FF595959", // teks catatan
  cf: "FFFFF2CC", // highlight selisih (conditional format)
};

const NUMFMT = "#,##0;[Red]-#,##0;-";
const DATEFMT = "dd mmm yyyy";

const HEADERS = [
  "Tanggal", "Hari", "Cash", "QRIS Statis", "QRIS Dinamis (Majoo)", "Transfer",
  "Total Pemasukan (hitung)", "Total Pemasukan (laporan)", "Selisih Total",
  "Item Pengeluaran", "Nominal (Rp)", "Total Pengeluaran", "Modal Awal",
  "Talangan / Tambahan Kas", "Sumber Talangan", "Uang di Laci Akhir Hari",
  "Saldo Cash (hitung)", "Saldo Cash (laporan)", "Selisih Saldo",
];
const WIDTHS = [13, 9, 12, 12, 15, 12, 15, 15, 11, 28, 13, 14, 12, 15, 15, 16, 14, 14, 11];
// Kolom yang di-merge per blok hari (kecuali J & K = baris item).
const MERGED_COLS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 13, 14, 15, 16, 17, 18, 19];
const BLOCK_MIN = 6;
const SOURCES = "Uang pribadi,Owner,Rekening toko";

type FontOpts = { b?: boolean; i?: boolean; s?: number; c?: string };
const font = (o: FontOpts = {}): Partial<ExcelJS.Font> => ({
  name: "Arial",
  size: o.s ?? 10,
  bold: o.b ?? false,
  italic: o.i ?? false,
  color: { argb: o.c ?? "FF000000" },
});
const fill = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const side = (style: "thin" | "medium"): ExcelJS.Border => ({ style, color: { argb: "FF000000" } });

type Ref = { name: string; first: number; last: number };

/** Daftar bulan "YYYY-MM" dari from sampai to (inklusif). */
export function monthsBetween(from: string, to: string): string[] {
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

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${BLN[m - 1]} ${y}`;
}

/** Judul ringkasan: "Bulan November 2026" atau "Oktober 2026 – Desember 2026". */
function rangeLabel(months: string[]): string {
  if (months.length === 1) return `Bulan ${monthLabel(months[0])}`;
  return `${monthLabel(months[0])} – ${monthLabel(months[months.length - 1])}`;
}

function gridBorder(first: boolean): ExcelJS.Borders {
  return {
    top: side(first ? "medium" : "thin"),
    left: side("thin"),
    right: side("thin"),
    bottom: side("thin"),
    diagonal: {},
  };
}

/** Sel input krem: angka (atau teks untuk sumber talangan). */
function inputCell(ws: ExcelJS.Worksheet, r: number, col: number, v: number | string | null, o: { num?: boolean; h?: boolean } = {}): void {
  const c = ws.getCell(r, col);
  if (v != null && v !== "") c.value = v;
  c.fill = fill(C.cream);
  c.font = font({ c: C.blue });
  if (o.num) c.numFmt = NUMFMT;
  c.alignment = { horizontal: o.h ? "center" : undefined, vertical: "middle" };
}

/** Sel rumus hitam (otomatis). */
function formulaCell(ws: ExcelJS.Worksheet, r: number, col: number, formula: string, o: { bold?: boolean; center?: boolean } = {}): void {
  const c = ws.getCell(r, col);
  c.value = { formula };
  c.numFmt = NUMFMT;
  c.font = font({ b: o.bold });
  c.alignment = { horizontal: o.center ? "center" : undefined, vertical: "middle" };
}

function monthSheet(wb: ExcelJS.Workbook, md: XlsxMonth, name: string): Ref {
  const ws = wb.addWorksheet(name);
  const [y, m] = md.month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();

  // Catatan: exceljs tidak menuliskan kolom berlebar 9 (nilai default-nya), jadi pakai 9.01.
  ws.columns = WIDTHS.map((w) => ({ width: w === 9 ? 9.01 : w }));
  ws.views = [{ state: "frozen" as const, xSplit: 2, ySplit: 4, topLeftCell: "C5" }];
  ws.pageSetup = { fitToPage: true, fitToWidth: 1, fitToHeight: 0, orientation: "landscape" as const };

  // Baris 1-2: judul & petunjuk (persis template).
  ws.getRow(1).height = 18;
  ws.getCell(1, 1).value = `Rekap Kas Harian - ${BLN[m - 1]} ${y}`;
  ws.getCell(1, 1).font = font({ b: true, s: 14, c: C.navy });
  ws.getCell(2, 1).value = "Isi kolom BIRU (area krem). Item pengeluaran: satu item per baris, maksimal 6 item per hari. Kolom hitam otomatis.";
  ws.getCell(2, 1).font = font({ i: true, s: 9, c: C.gray });

  // Baris 3: modal kasir.
  ws.getCell(3, 1).value = "Modal kasir harian (Rp):";
  ws.getCell(3, 1).font = font({ b: true });
  const c3 = ws.getCell(3, 3);
  c3.value = md.modal;
  c3.numFmt = NUMFMT;
  c3.fill = fill(C.yellow);
  c3.font = font({ b: true, c: C.blue });
  c3.border = { top: side("thin"), left: side("thin"), right: side("thin"), bottom: side("thin") };

  // Baris 4: header.
  ws.getRow(4).height = 42;
  HEADERS.forEach((h, i) => {
    const c = ws.getRow(4).getCell(i + 1);
    c.value = h;
    c.fill = fill(C.navy);
    c.font = font({ b: true, c: C.white });
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.border = { top: side("thin"), left: side("thin"), right: side("thin"), bottom: side("thin") };
  });

  // Blok per hari (setiap hari dalam bulan dapat blok, sama seperti template).
  let r = 5;
  const oRows: number[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${md.month}-${String(d).padStart(2, "0")}`;
    const day = md.days[key];
    const items = (day?.items ?? []).filter((it) => it.n || it.v != null);
    const h = Math.max(BLOCK_MIN, items.length);
    const rEnd = r + h - 1;

    for (const col of MERGED_COLS) ws.mergeCells(r, col, rEnd, col);
    for (let rr = r; rr <= rEnd; rr++) {
      ws.getRow(rr).height = 15.75;
      const brd = gridBorder(rr === r);
      for (let col = 1; col <= 19; col++) {
        const c = ws.getCell(rr, col);
        c.border = brd;
        if (!c.font || !c.font.name) c.font = font();
      }
    }

    // A: tanggal, B: hari (rumus).
    const a = ws.getCell(r, 1);
    a.value = new Date(Date.UTC(y, m - 1, d));
    a.numFmt = DATEFMT;
    a.font = font();
    a.alignment = { horizontal: "center", vertical: "middle" };
    formulaCell(ws, r, 2, `CHOOSE(WEEKDAY(A${r},2),"Senin","Selasa","Rabu","Kamis","Jumat","Sabtu","Minggu")`, { center: true });

    // C-F: pemasukan (input).
    inputCell(ws, r, 3, day?.cash ?? null, { num: true });
    inputCell(ws, r, 4, day?.qs ?? null, { num: true });
    inputCell(ws, r, 5, day?.qd ?? null, { num: true });
    inputCell(ws, r, 6, day?.tf ?? null, { num: true });
    formulaCell(ws, r, 7, `IF(COUNT(C${r}:F${r})=0,"",SUM(C${r}:F${r}))`); // G
    inputCell(ws, r, 8, day?.lapM ?? null, { num: true }); // H (laporan)
    formulaCell(ws, r, 9, `IF(OR(G${r}="",H${r}=""),"",G${r}-H${r})`); // I selisih total

    // J-K: item pengeluaran (satu per baris).
    items.forEach((it, i) => {
      const j = ws.getCell(r + i, 10);
      j.value = it.n || "Tanpa keterangan";
      j.fill = fill(C.cream);
      j.font = font({ c: C.blue });
      const k = ws.getCell(r + i, 11);
      if (it.v != null) k.value = it.v;
      k.numFmt = NUMFMT;
      k.fill = fill(C.cream);
      k.font = font({ c: C.blue });
    });

    formulaCell(ws, r, 12, `IF(COUNT(K${r}:K${rEnd})=0,"",SUM(K${r}:K${rEnd}))`); // L total pengeluaran
    formulaCell(ws, r, 13, `IF(OR(COUNT(C${r}:F${r})>0,COUNT(K${r}:K${rEnd})>0),$C$3,"")`); // M modal awal
    inputCell(ws, r, 14, day?.tal ?? null, { num: true }); // N talangan
    inputCell(ws, r, 15, day && day.tal ? day.sumber : null, { h: true }); // O sumber
    formulaCell(ws, r, 16, `IF(OR(COUNT(C${r}:F${r})>0,COUNT(K${r}:K${rEnd})>0),N(M${r})+N(C${r})-N(L${r})+N(N${r}),"")`, { bold: true }); // P uang di laci
    formulaCell(ws, r, 17, `IF(OR(COUNT(C${r}:F${r})>0,COUNT(K${r}:K${rEnd})>0),N(C${r})-N(L${r}),"")`); // Q saldo cash
    inputCell(ws, r, 18, day?.lapS ?? null, { num: true }); // R (laporan)
    formulaCell(ws, r, 19, `IF(OR(Q${r}="",R${r}=""),"",Q${r}-R${r})`); // S selisih saldo

    oRows.push(r);
    r = rEnd + 1;
  }
  const last = r - 1;

  // Baris TOTAL.
  const trow = ws.getRow(r);
  for (let col = 1; col <= 19; col++) {
    const c = trow.getCell(col);
    c.fill = fill(C.light);
    c.font = font({ b: true });
    c.border = gridBorder(true);
  }
  trow.getCell(1).value = "TOTAL";
  const letter = (col: number) => String.fromCharCode(64 + col);
  for (const col of [3, 4, 5, 6, 7, 8, 9, 11, 12, 14, 17, 18, 19]) {
    const c = trow.getCell(col);
    c.value = { formula: `SUM(${letter(col)}5:${letter(col)}${last})` };
    c.numFmt = NUMFMT;
  }

  // Catatan rumus di bawah tabel.
  ws.getCell(r + 2, 1).value = "Uang di Laci Akhir Hari = Modal Awal + Cash - Total Pengeluaran + Talangan. Merah/minus = masih ada kekurangan yang belum ditutup.";
  ws.getCell(r + 2, 1).font = font({ s: 9 });
  ws.getCell(r + 3, 1).value = "Saldo Cash (hitung) = Cash - Total Pengeluaran (tanpa modal), dibandingkan dengan saldo cash di laporan. Kuning di kolom Selisih = angka tidak cocok.";
  ws.getCell(r + 3, 1).font = font({ s: 9 });

  // Conditional format: kuning kalau selisih tidak nol (sama seperti template).
  const cfRule = (col: string): ExcelJS.ConditionalFormattingRule => ({
    type: "expression",
    priority: 1,
    formulae: [`AND(${col}5<>"",${col}5<>0)`],
    style: { fill: { type: "pattern" as const, pattern: "solid" as const, bgColor: { argb: C.cf } } },
  });
  ws.addConditionalFormatting({ ref: `I5:I${last}`, rules: [cfRule("I")] });
  ws.addConditionalFormatting({ ref: `S5:S${last}`, rules: [cfRule("S")] });

  // Dropdown sumber talangan di baris pertama tiap blok (API exceljs per sel).
  const dv = (ws as unknown as { dataValidations?: { add?: (range: string, options: object) => void } }).dataValidations;
  for (const x of oRows) dv?.add?.(`O${x}`, { type: "list", allowBlank: true, formula1: `"${SOURCES}"` });

  return { name, first: 5, last };
}

function ringkasanSheet(wb: ExcelJS.Workbook, refs: (Ref & { month: string })[]): void {
  const ws = wb.addWorksheet("Ringkasan");
  ws.columns = [{ width: 40 }, { width: 18 }];

  ws.getRow(1).height = 18;
  ws.getCell(1, 1).value = `Ringkasan ${rangeLabel(refs.map((x) => x.month))}`;
  ws.getCell(1, 1).font = font({ b: true, s: 14, c: C.navy });
  ws.getCell(2, 1).value =
    refs.length === 1
      ? "Semua angka otomatis dari sheet Rekap Harian."
      : "Semua angka otomatis dari sheet rekap tiap bulan.";
  ws.getCell(2, 1).font = font({ i: true, s: 9, c: C.gray });

  const sumOf = (col: string) => refs.map((x) => `SUM('${x.name}'!$${col}$5:$${col}$${x.last})`).join("+");
  const sumifOf = (condCol: string, labelRef: string, valCol: string) =>
    refs.map((x) => `SUMIF('${x.name}'!$${condCol}$5:$${condCol}$${x.last},${labelRef},'${x.name}'!$${valCol}$5:$${valCol}$${x.last})`).join("+");

  const section = (r: number, text: string) => {
    ws.getCell(r, 1).value = text;
    ws.getCell(r, 1).font = font({ b: true, s: 11, c: C.navy });
  };
  const row = (r: number, label: string, formula: string, o: { total?: boolean; input?: boolean } = {}) => {
    const a = ws.getCell(r, 1);
    if (label) a.value = label;
    a.border = { top: side("thin"), left: side("thin"), right: side("thin"), bottom: side("thin") };
    const b = ws.getCell(r, 2);
    b.value = { formula };
    b.numFmt = NUMFMT;
    b.border = a.border;
    if (o.total) {
      a.fill = fill(C.light); a.font = font({ b: true });
      b.fill = fill(C.light); b.font = font({ b: true });
    } else if (o.input) {
      a.fill = fill(C.cream); a.font = font({ c: C.blue });
      b.font = font();
    } else {
      a.font = font(); b.font = font();
    }
  };

  section(4, "PEMASUKAN");
  row(5, "Cash", sumOf("C"));
  row(6, "QRIS Statis", sumOf("D"));
  row(7, "QRIS Dinamis (Majoo)", sumOf("E"));
  row(8, "Transfer", sumOf("F"));
  row(9, "Total pemasukan", "SUM(B5:B8)", { total: true });

  section(11, "PENGELUARAN & SALDO CASH");
  row(12, "Total pengeluaran cash", sumOf("K"));
  row(13, "Cash masuk - pengeluaran (tanpa modal)", "B5-B12", { total: true });

  section(15, "TALANGAN PER SUMBER");
  row(16, "Uang pribadi", sumifOf("O", "A16", "N"));
  row(17, "Owner", sumifOf("O", "A17", "N"));
  row(18, "Rekening toko", sumifOf("O", "A18", "N"));
  row(19, "Total talangan", "SUM(B16:B18)", { total: true });

  section(21, "PENGELUARAN PER KETERANGAN");
  ws.getCell(22, 1).value = "Isi nama keterangan di kolom A (persis seperti di Rekap Harian, misal 'Bensin'). Nominal otomatis.";
  ws.getCell(22, 1).font = font({ i: true, s: 9 });
  ws.getRow(23).height = 21.75;
  for (const [col, text] of [[1, "Keterangan"], [2, "Total (Rp)"]] as const) {
    const c = ws.getCell(23, col);
    c.value = text;
    c.fill = fill(C.navy);
    c.font = font({ b: true, c: C.white });
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.border = { top: side("thin"), left: side("thin"), right: side("thin"), bottom: side("thin") };
  }
  for (let r = 24; r <= 38; r++) row(r, "", `IF(A${r}="","",${sumifOf("J", `A${r}`, "K")})`, { input: true });
  row(39, "Lainnya (belum terdaftar di atas)", "B12-SUM(B24:B38)", { total: true });
}

/** Gabungkan semua sheet lalu tulis buffer .xlsx. */
export async function buildXlsx(months: XlsxMonth[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Rekap Kas Harian";
  wb.created = new Date();

  const single = months.length === 1;
  const refs: (Ref & { month: string })[] = [];
  for (const md of months) {
    // Satu bulan = nama sheet persis template ("Rekap Harian"); banyak bulan = satu sheet per bulan.
    const name = single ? "Rekap Harian" : `Rekap ${monthLabel(md.month)}`;
    refs.push({ month: md.month, ...monthSheet(wb, md, name) });
  }
  ringkasanSheet(wb, refs);

  // Paksa Excel menghitung ulang semua rumus saat file dibuka (exceljs tidak menyimpan nilai cache).
  wb.calcProperties = { fullCalcOnLoad: true };

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as unknown as Uint8Array);
}
