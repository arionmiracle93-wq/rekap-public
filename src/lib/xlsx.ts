import ExcelJS from "exceljs";
import { BLN, DEFAULT_MODAL, HARI, SRC, calc, type Day } from "@/lib/calc";

const NUM_FMT = "#,##0;[Red]-#,##0;-";
const DATE_FMT = "dd mmm yyyy";

const THIN_GRAY: ExcelJS.Border = { style: "thin", color: { argb: "FFBFBFBF" } };
const MED_NAVY: ExcelJS.Border = { style: "medium", color: { argb: "FF1F4E78" } };

const BORDER_ALL_THIN: Partial<ExcelJS.Borders> = {
  top: THIN_GRAY,
  bottom: THIN_GRAY,
  left: THIN_GRAY,
  right: THIN_GRAY,
};

const FILL_HEADER: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1F4E78" },
  bgColor: { argb: "FF003366" },
};

const FILL_INPUT: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFFFBE6" },
  bgColor: { argb: "FFFFFFFF" },
};

const FILL_TOTAL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFDDEBF7" },
  bgColor: { argb: "FFCCFFFF" },
};

const FILL_MODAL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFFFF00" },
  bgColor: { argb: "FFFFFF00" },
};

const FILL_NONE: ExcelJS.Fill = {
  type: "pattern",
  pattern: "none",
};

const FONT_TITLE: Partial<ExcelJS.Font> = {
  name: "Arial",
  size: 14,
  bold: true,
  color: { argb: "FF1F4E78" },
  charset: 1,
};

const FONT_SUBTITLE: Partial<ExcelJS.Font> = {
  name: "Arial",
  size: 9,
  italic: true,
  color: { argb: "FF595959" },
  charset: 1,
};

const FONT_NOTE: Partial<ExcelJS.Font> = {
  name: "Arial",
  size: 9,
  italic: true,
  charset: 1,
};

const FONT_SECTION: Partial<ExcelJS.Font> = {
  name: "Arial",
  size: 11,
  bold: true,
  color: { argb: "FF1F4E78" },
  charset: 1,
};

const FONT_HEADER: Partial<ExcelJS.Font> = {
  name: "Arial",
  size: 10,
  bold: true,
  color: { argb: "FFFFFFFF" },
  charset: 1,
};

const FONT_INPUT: Partial<ExcelJS.Font> = {
  name: "Arial",
  size: 10,
  color: { argb: "FF0000FF" },
  charset: 1,
};

const FONT_AUTO: Partial<ExcelJS.Font> = {
  name: "Arial",
  size: 10,
  color: { argb: "FF000000" },
  charset: 1,
};

const FONT_BOLD: Partial<ExcelJS.Font> = {
  name: "Arial",
  size: 10,
  bold: true,
  color: { argb: "FF000000" },
  charset: 1,
};

const HEADERS_REKAP: [string, number][] = [
  ["Tanggal", 13],
  ["Hari", 9],
  ["Cash", 12],
  ["QRIS Statis", 12],
  ["QRIS Dinamis (Majoo)", 15],
  ["Transfer", 12],
  ["Total Pemasukan (hitung)", 15],
  ["Total Pemasukan (laporan)", 15],
  ["Selisih Total", 11],
  ["Item Pengeluaran", 28],
  ["Nominal (Rp)", 13],
  ["Total Pengeluaran", 14],
  ["Modal Awal", 12],
  ["Talangan / Tambahan Kas", 15],
  ["Sumber Talangan", 15],
  ["Uang di Laci Akhir Hari", 16],
  ["Saldo Cash (hitung)", 14],
  ["Saldo Cash (laporan)", 14],
  ["Selisih Saldo", 11],
];

// Kolom yang di-merge per blok hari (semua kecuali kolom 10=Item dan 11=Nominal)
const MERGED_COLS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 13, 14, 15, 16, 17, 18, 19] as const;
// Kolom input biru (area krem)
const INPUT_COLS = new Set([3, 4, 5, 6, 8, 10, 11, 14, 15, 18]);
// Kolom berformat angka ribuan
const NUM_COLS = new Set([3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 16, 17, 18, 19]);

const pad = (n: number) => String(n).padStart(2, "0");

/** Semua tanggal kalender dalam satu bulan ("2026-11" -> ["2026-11-01", ..., "2026-11-30"]). */
export function daysInMonth(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const count = new Date(y, m, 0).getDate();
  return Array.from({ length: count }, (_, i) => `${month}-${pad(i + 1)}`);
}

/** Semua tanggal kalender di antara `from` dan `to` (inklusif). */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

export type XlsxParams = {
  /** Bulan tunggal ("2026-11") atau kosong jika mode rentang. */
  month?: string;
  /** Rentang awal ("YYYY-MM-DD") jika bukan bulan tunggal. */
  from?: string;
  /** Rentang akhir ("YYYY-MM-DD") jika bukan bulan tunggal. */
  to?: string;
  /** Modal kasir: satu angka (mode bulan) atau map per bulan "YYYY-MM" (mode rentang). */
  modal: number | Record<string, number>;
  /** Data harian terisi. */
  days: Record<string, Day>;
};

/** Nama file .xlsx sesuai konvensi template ("Rekap_Kas_Nov_2026.xlsx"). */
export function xlsxFilename(params: { month?: string; from?: string; to?: string }): string {
  if (params.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month)) {
    const [y, m] = params.month.split("-").map(Number);
    return `Rekap_Kas_${BLN[m - 1].slice(0, 3)}_${y}.xlsx`;
  }
  if (params.from && params.to) {
    if (params.from.endsWith("-01-01") && params.to.endsWith("-12-31") && params.from.slice(0, 4) === params.to.slice(0, 4)) {
      return `Rekap_Kas_Tahun_${params.from.slice(0, 4)}.xlsx`;
    }
    return `Rekap_Kas_${params.from}_sd_${params.to}.xlsx`;
  }
  return "Rekap_Kas.xlsx";
}

/**
 * Buat file Excel (.xlsx) dengan format persis seperti template "Rekap_Kas_Nov_2026.xlsx":
 * - Sheet 1: "Rekap Harian" (judul, modal kasir C3, 19 kolom header, blok 6 baris per hari dengan merge & rumus, baris TOTAL, catatan bawah)
 * - Sheet 2: "Ringkasan" (Pemasukan, Pengeluaran & Saldo Cash, Talangan per Sumber, Pengeluaran per Keterangan dengan rumus SUM / SUMIF)
 */
export async function buildXlsx(params: XlsxParams): Promise<Buffer> {
  const { month, from, to, modal, days } = params;

  const modalOf = (dateKey: string): number => {
    if (typeof modal === "number") return modal;
    return modal[dateKey.slice(0, 7)] ?? DEFAULT_MODAL;
  };

  let dateKeys: string[];
  let titleSuffix: string;
  let summaryTitle: string;
  let baseModal: number;

  if (month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    const monthName = `${BLN[m - 1]} ${y}`;
    dateKeys = daysInMonth(month);
    titleSuffix = monthName;
    summaryTitle = `Ringkasan Bulan ${monthName}`;
    baseModal = typeof modal === "number" ? modal : modal[month] ?? DEFAULT_MODAL;
  } else if (from && to) {
    const spanDays = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
    const filledKeys = Object.keys(days).sort();
    // Untuk rentang pendek (<= 35 hari), tampilkan seluruh tanggal seperti bulanan;
    // untuk rentang panjang (mis. 90 hari / 1 tahun), tampilkan hari-hari terisi (atau bulan pertama bila kosong).
    if (spanDays <= 35) {
      dateKeys = datesBetween(from, to);
    } else if (filledKeys.length > 0) {
      dateKeys = filledKeys;
    } else {
      dateKeys = daysInMonth(from.slice(0, 7));
    }

    if (from.endsWith("-01-01") && to.endsWith("-12-31") && from.slice(0, 4) === to.slice(0, 4)) {
      titleSuffix = `Tahun ${from.slice(0, 4)}`;
      summaryTitle = `Ringkasan Tahun ${from.slice(0, 4)}`;
    } else {
      titleSuffix = `${from} s/d ${to}`;
      summaryTitle = `Ringkasan Periode ${from} s/d ${to}`;
    }
    baseModal = modalOf(dateKeys[0] ?? from);
  } else {
    const sorted = Object.keys(days).sort();
    const fallbackMonth = sorted[0]?.slice(0, 7) ?? new Date().toISOString().slice(0, 7);
    const [y, m] = fallbackMonth.split("-").map(Number);
    const monthName = `${BLN[m - 1]} ${y}`;
    dateKeys = daysInMonth(fallbackMonth);
    titleSuffix = monthName;
    summaryTitle = `Ringkasan Bulan ${monthName}`;
    baseModal = modalOf(`${fallbackMonth}-01`);
  }

  const wb = new ExcelJS.Workbook();

  // =========================================================================
  // SHEET 1: Rekap Harian
  // =========================================================================
  const ws1 = wb.addWorksheet("Rekap Harian", {
    properties: { defaultRowHeight: 15, dyDescent: 0.25, defaultColWidth: 8.7109375 },
    views: [
      {
        state: "frozen",
        xSplit: 2,
        ySplit: 4,
        topLeftCell: "C5",
        showGridLines: true,
        zoomScale: 100,
        zoomScaleNormal: 100,
      },
    ],
    pageSetup: {
      fitToPage: true,
      orientation: "landscape",
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: "4:4",
      margins: { left: 0.75, right: 0.75, top: 1, bottom: 1, header: 0.511811023622047, footer: 0.511811023622047 },
    },
  });

  ws1.columns = HEADERS_REKAP.map(([, width]) => ({ width }));

  // Baris 1: Judul
  const r1 = ws1.getRow(1);
  r1.height = 18;
  const a1 = r1.getCell(1);
  a1.value = `Rekap Kas Harian - ${titleSuffix}`;
  a1.font = FONT_TITLE;
  a1.fill = FILL_NONE;

  // Baris 2: Petunjuk
  const r2 = ws1.getRow(2);
  const a2 = r2.getCell(1);
  a2.value = "Isi kolom BIRU (area krem). Item pengeluaran: satu item per baris, maksimal 6 item per hari. Kolom hitam otomatis.";
  a2.font = FONT_SUBTITLE;
  a2.fill = FILL_NONE;

  // Baris 3: Modal kasir harian
  const r3 = ws1.getRow(3);
  const a3 = r3.getCell(1);
  a3.value = "Modal kasir harian (Rp):";
  a3.font = FONT_BOLD;
  a3.fill = FILL_NONE;

  const c3 = r3.getCell(3);
  c3.value = baseModal;
  c3.numFmt = NUM_FMT;
  c3.font = { ...FONT_INPUT, bold: true };
  c3.fill = FILL_MODAL;
  c3.border = BORDER_ALL_THIN;

  // Baris 4: Header Tabel
  const r4 = ws1.getRow(4);
  r4.height = 42;
  HEADERS_REKAP.forEach(([label], idx) => {
    const cell = r4.getCell(idx + 1);
    cell.value = label;
    cell.font = FONT_HEADER;
    cell.fill = FILL_HEADER;
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = BORDER_ALL_THIN;
  });

  // Akumulator untuk cached result di rumus TOTAL & Ringkasan
  let sumCash = 0;
  let sumQs = 0;
  let sumQd = 0;
  let sumTf = 0;
  let sumMasuk = 0;
  let sumLapM = 0;
  let sumSelM = 0;
  let sumKeluar = 0;
  let sumTal = 0;
  let sumSaldo = 0;
  let sumLapS = 0;
  let sumSelS = 0;
  const talBySource: Record<string, number> = Object.fromEntries(SRC.map((s) => [s, 0]));
  const ketTotals = new Map<string, { name: string; total: number }>();

  let currentRow = 5;

  for (const dateKey of dateKeys) {
    const d = days[dateKey];
    const dayModal = modalOf(dateKey);
    const c = calc(d, dayModal);
    const items = d?.items ?? [];
    const blockHeight = Math.max(6, items.length);
    const rStart = currentRow;
    const rEnd = rStart + blockHeight - 1;

    if (d) {
      sumCash += d.cash ?? 0;
      sumQs += d.qs ?? 0;
      sumQd += d.qd ?? 0;
      sumTf += d.tf ?? 0;
      sumMasuk += c.masuk ?? 0;
      sumLapM += d.lapM ?? 0;
      sumSelM += c.selM ?? 0;
      sumKeluar += c.keluar ?? 0;
      sumTal += d.tal ?? 0;
      sumSaldo += c.saldo ?? 0;
      sumLapS += d.lapS ?? 0;
      sumSelS += c.selS ?? 0;
      if (d.tal != null && d.tal !== 0) {
        const srcName = (SRC as readonly string[]).includes(d.sumber) ? d.sumber : SRC[0];
        talBySource[srcName] = (talBySource[srcName] ?? 0) + d.tal;
      }
      for (const it of items) {
        if (it.v == null) continue;
        const trimmed = it.n.trim();
        if (!trimmed) continue;
        const k = trimmed.toLowerCase();
        const prev = ketTotals.get(k) ?? { name: trimmed, total: 0 };
        prev.total += it.v;
        ketTotals.set(k, prev);
      }
    }

    // Set tinggi baris & item pengeluaran (kolom J & K)
    for (let r = rStart; r <= rEnd; r++) {
      const row = ws1.getRow(r);
      row.height = 15.75;
      const item = items[r - rStart];
      const jCell = row.getCell(10);
      const kCell = row.getCell(11);
      jCell.value = item?.n ? item.n : null;
      kCell.value = item?.v ?? null;
    }

    // Nilai & rumus di baris utama (rStart)
    const utcDate = new Date(`${dateKey}T00:00:00.000Z`);
    const hariName = HARI[utcDate.getUTCDay()];
    const topRow = ws1.getRow(rStart);

    topRow.getCell(1).value = utcDate;
    topRow.getCell(2).value = {
      formula: `CHOOSE(WEEKDAY(A${rStart},2),"Senin","Selasa","Rabu","Kamis","Jumat","Sabtu","Minggu")`,
      result: hariName,
    };
    topRow.getCell(3).value = d?.cash ?? null;
    topRow.getCell(4).value = d?.qs ?? null;
    topRow.getCell(5).value = d?.qd ?? null;
    topRow.getCell(6).value = d?.tf ?? null;
    topRow.getCell(7).value = {
      formula: `IF(COUNT(C${rStart}:F${rStart})=0,"",SUM(C${rStart}:F${rStart}))`,
      result: c.masuk ?? "",
    };
    topRow.getCell(8).value = d?.lapM ?? null;
    topRow.getCell(9).value = {
      formula: `IF(OR(G${rStart}="",H${rStart}=""),"",G${rStart}-H${rStart})`,
      result: c.selM ?? "",
    };
    topRow.getCell(12).value = {
      formula: `IF(COUNT(K${rStart}:K${rEnd})=0,"",SUM(K${rStart}:K${rEnd}))`,
      result: c.keluar ?? "",
    };
    const modalFormulaRef = dayModal === baseModal ? "$C$3" : String(dayModal);
    topRow.getCell(13).value = {
      formula: `IF(OR(COUNT(C${rStart}:F${rStart})>0,COUNT(K${rStart}:K${rEnd})>0),${modalFormulaRef},"")`,
      result: c.has ? dayModal : "",
    };
    topRow.getCell(14).value = d?.tal ?? null;
    topRow.getCell(15).value = d?.tal != null ? d.sumber : null;
    topRow.getCell(16).value = {
      formula: `IF(OR(COUNT(C${rStart}:F${rStart})>0,COUNT(K${rStart}:K${rEnd})>0),N(M${rStart})+N(C${rStart})-N(L${rStart})+N(N${rStart}),"")`,
      result: c.laci ?? "",
    };
    topRow.getCell(17).value = {
      formula: `IF(OR(COUNT(C${rStart}:F${rStart})>0,COUNT(K${rStart}:K${rEnd})>0),N(C${rStart})-N(L${rStart}),"")`,
      result: c.saldo ?? "",
    };
    topRow.getCell(18).value = d?.lapS ?? null;
    topRow.getCell(19).value = {
      formula: `IF(OR(Q${rStart}="",R${rStart}=""),"",Q${rStart}-R${rStart})`,
      result: c.selS ?? "",
    };

    // Merge vertikal untuk kolom selain J (10) dan K (11)
    for (const col of MERGED_COLS) {
      ws1.mergeCells(rStart, col, rEnd, col);
    }

    // Format tampilan, warna, alignment, dataValidation, dan border untuk setiap sel di blok hari ini
    for (let r = rStart; r <= rEnd; r++) {
      const row = ws1.getRow(r);
      for (let col = 1; col <= 19; col++) {
        const cell = row.getCell(col);
        const isInput = INPUT_COLS.has(col);
        cell.font = isInput ? FONT_INPUT : col === 16 ? FONT_BOLD : FONT_AUTO;
        cell.fill = isInput ? FILL_INPUT : FILL_NONE;

        if (col === 1) {
          cell.numFmt = DATE_FMT;
        } else if (NUM_COLS.has(col)) {
          cell.numFmt = NUM_FMT;
        }

        if (col === 1 || col === 2 || col === 15) {
          cell.alignment = { horizontal: "center", vertical: "middle" };
        } else if (col !== 10 && col !== 11) {
          cell.alignment = { vertical: "middle" };
        }

        if (col === 15 && r === rStart) {
          cell.dataValidation = {
            type: "list",
            allowBlank: true,
            formulae: ['"Uang pribadi,Owner,Rekening toko"'],
          };
        }

        cell.border = {
          left: THIN_GRAY,
          right: THIN_GRAY,
          top: r === rStart ? MED_NAVY : THIN_GRAY,
          bottom: r === rEnd ? MED_NAVY : THIN_GRAY,
        };
      }
    }

    currentRow = rEnd + 1;
  }

  const lastDataRow = currentRow - 1;
  const rTotalIdx = currentRow;

  // Baris TOTAL di bawah data
  const rTotal = ws1.getRow(rTotalIdx);
  rTotal.getCell(1).value = "TOTAL";
  rTotal.getCell(2).value = null;
  rTotal.getCell(3).value = { formula: `SUM(C5:C${lastDataRow})`, result: sumCash };
  rTotal.getCell(4).value = { formula: `SUM(D5:D${lastDataRow})`, result: sumQs };
  rTotal.getCell(5).value = { formula: `SUM(E5:E${lastDataRow})`, result: sumQd };
  rTotal.getCell(6).value = { formula: `SUM(F5:F${lastDataRow})`, result: sumTf };
  rTotal.getCell(7).value = { formula: `SUM(G5:G${lastDataRow})`, result: sumMasuk };
  rTotal.getCell(8).value = { formula: `SUM(H5:H${lastDataRow})`, result: sumLapM };
  rTotal.getCell(9).value = { formula: `SUM(I5:I${lastDataRow})`, result: sumSelM };
  rTotal.getCell(10).value = null;
  rTotal.getCell(11).value = { formula: `SUM(K5:K${lastDataRow})`, result: sumKeluar };
  rTotal.getCell(12).value = { formula: `SUM(L5:L${lastDataRow})`, result: sumKeluar };
  rTotal.getCell(13).value = null;
  rTotal.getCell(14).value = { formula: `SUM(N5:N${lastDataRow})`, result: sumTal };
  rTotal.getCell(15).value = null;
  rTotal.getCell(16).value = null;
  rTotal.getCell(17).value = { formula: `SUM(Q5:Q${lastDataRow})`, result: sumSaldo };
  rTotal.getCell(18).value = { formula: `SUM(R5:R${lastDataRow})`, result: sumLapS };
  rTotal.getCell(19).value = { formula: `SUM(S5:S${lastDataRow})`, result: sumSelS };

  for (let col = 1; col <= 19; col++) {
    const cell = rTotal.getCell(col);
    cell.font = FONT_BOLD;
    cell.fill = FILL_TOTAL;
    if (NUM_COLS.has(col)) cell.numFmt = NUM_FMT;
    cell.border = {
      left: THIN_GRAY,
      right: THIN_GRAY,
      top: MED_NAVY,
      bottom: THIN_GRAY,
    };
  }

  // Catatan kaki persis seperti di template
  const note1 = ws1.getRow(rTotalIdx + 2).getCell(1);
  note1.value = "Uang di Laci Akhir Hari = Modal Awal + Cash - Total Pengeluaran + Talangan. Merah/minus = masih ada kekurangan yang belum ditutup.";
  note1.font = FONT_NOTE;

  const note2 = ws1.getRow(rTotalIdx + 3).getCell(1);
  note2.value = "Saldo Cash (hitung) = Cash - Total Pengeluaran (tanpa modal), dibandingkan dengan saldo cash di laporan. Kuning di kolom Selisih = angka tidak cocok.";
  note2.font = FONT_NOTE;

  const note3 = ws1.getRow(rTotalIdx + 4).getCell(1);
  note3.value = "Contoh isi item: Keterangan 'Beli token', Nominal 103500.";
  note3.font = FONT_NOTE;

  // Conditional formatting kolom Selisih (I dan S) seperti di template
  ws1.addConditionalFormatting({
    ref: `I5:I${lastDataRow}`,
    rules: [
      {
        type: "expression",
        priority: 2,
        formulae: ['AND(I5<>"",I5<>0)'],
        style: {
          fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFF2CC" }, fgColor: { argb: "FFFFF2CC" } },
        },
      },
    ],
  });
  ws1.addConditionalFormatting({
    ref: `S5:S${lastDataRow}`,
    rules: [
      {
        type: "expression",
        priority: 3,
        formulae: ['AND(S5<>"",S5<>0)'],
        style: {
          fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFF2CC" }, fgColor: { argb: "FFFFF2CC" } },
        },
      },
    ],
  });

  // =========================================================================
  // SHEET 2: Ringkasan
  // =========================================================================
  const ws2 = wb.addWorksheet("Ringkasan", {
    properties: { defaultRowHeight: 15, dyDescent: 0.25, defaultColWidth: 8.7109375 },
    views: [{ state: "normal", showGridLines: true, zoomScale: 100, zoomScaleNormal: 100 }],
    pageSetup: {
      fitToPage: false,
      paperSize: 9,
      orientation: "portrait",
      margins: { left: 0.75, right: 0.75, top: 1, bottom: 1, header: 0.511811023622047, footer: 0.511811023622047 },
    },
  });

  ws2.columns = [{ width: 40 }, { width: 18 }];

  const setSummaryRow = (
    rowIdx: number,
    label: string,
    formulaObj: { formula: string; result?: number | string },
    isTotal = false,
  ) => {
    const row = ws2.getRow(rowIdx);
    const cA = row.getCell(1);
    const cB = row.getCell(2);
    cA.value = label;
    cA.font = isTotal ? FONT_BOLD : FONT_AUTO;
    cA.fill = isTotal ? FILL_TOTAL : FILL_NONE;
    cA.border = BORDER_ALL_THIN;

    cB.value = formulaObj;
    cB.numFmt = NUM_FMT;
    cB.font = isTotal ? FONT_BOLD : FONT_AUTO;
    cB.fill = isTotal ? FILL_TOTAL : FILL_NONE;
    cB.border = BORDER_ALL_THIN;
  };

  // Judul Ringkasan
  const s1 = ws2.getRow(1);
  s1.height = 18;
  s1.getCell(1).value = summaryTitle;
  s1.getCell(1).font = FONT_TITLE;
  s1.getCell(1).fill = FILL_NONE;

  const s2 = ws2.getRow(2);
  s2.getCell(1).value = "Semua angka otomatis dari sheet Rekap Harian.";
  s2.getCell(1).font = FONT_SUBTITLE;
  s2.getCell(1).fill = FILL_NONE;

  // Bagian 1: PEMASUKAN
  ws2.getRow(4).getCell(1).value = "PEMASUKAN";
  ws2.getRow(4).getCell(1).font = FONT_SECTION;
  setSummaryRow(5, "Cash", { formula: `SUM('Rekap Harian'!$C$5:$C$${lastDataRow})`, result: sumCash });
  setSummaryRow(6, "QRIS Statis", { formula: `SUM('Rekap Harian'!$D$5:$D$${lastDataRow})`, result: sumQs });
  setSummaryRow(7, "QRIS Dinamis (Majoo)", { formula: `SUM('Rekap Harian'!$E$5:$E$${lastDataRow})`, result: sumQd });
  setSummaryRow(8, "Transfer", { formula: `SUM('Rekap Harian'!$F$5:$F$${lastDataRow})`, result: sumTf });
  setSummaryRow(9, "Total pemasukan", { formula: "SUM(B5:B8)", result: sumMasuk }, true);

  // Bagian 2: PENGELUARAN & SALDO CASH
  ws2.getRow(11).getCell(1).value = "PENGELUARAN & SALDO CASH";
  ws2.getRow(11).getCell(1).font = FONT_SECTION;
  setSummaryRow(12, "Total pengeluaran cash", { formula: `SUM('Rekap Harian'!$K$5:$K$${lastDataRow})`, result: sumKeluar });
  setSummaryRow(13, "Cash masuk - pengeluaran (tanpa modal)", { formula: "B5-B12", result: sumCash - sumKeluar }, true);

  // Bagian 3: TALANGAN PER SUMBER
  ws2.getRow(15).getCell(1).value = "TALANGAN PER SUMBER";
  ws2.getRow(15).getCell(1).font = FONT_SECTION;
  setSummaryRow(16, "Uang pribadi", {
    formula: `SUMIF('Rekap Harian'!$O$5:$O$${lastDataRow},A16,'Rekap Harian'!$N$5:$N$${lastDataRow})`,
    result: talBySource["Uang pribadi"] ?? 0,
  });
  setSummaryRow(17, "Owner", {
    formula: `SUMIF('Rekap Harian'!$O$5:$O$${lastDataRow},A17,'Rekap Harian'!$N$5:$N$${lastDataRow})`,
    result: talBySource["Owner"] ?? 0,
  });
  setSummaryRow(18, "Rekening toko", {
    formula: `SUMIF('Rekap Harian'!$O$5:$O$${lastDataRow},A18,'Rekap Harian'!$N$5:$N$${lastDataRow})`,
    result: talBySource["Rekening toko"] ?? 0,
  });
  setSummaryRow(19, "Total talangan", { formula: "SUM(B16:B18)", result: sumTal }, true);

  // Bagian 4: PENGELUARAN PER KETERANGAN
  ws2.getRow(21).getCell(1).value = "PENGELUARAN PER KETERANGAN";
  ws2.getRow(21).getCell(1).font = FONT_SECTION;

  const s22 = ws2.getRow(22).getCell(1);
  s22.value = "Isi nama keterangan di kolom A (persis seperti di Rekap Harian, misal 'Bensin'). Nominal otomatis.";
  s22.font = FONT_NOTE;

  const s23 = ws2.getRow(23);
  s23.height = 21.75;
  ["Keterangan", "Total (Rp)"].forEach((h, i) => {
    const cell = s23.getCell(i + 1);
    cell.value = h;
    cell.font = FONT_HEADER;
    cell.fill = FILL_HEADER;
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = BORDER_ALL_THIN;
  });

  const sortedKets = [...ketTotals.values()].sort((a, b) => b.total - a.total);
  const ketSlotCount = Math.max(15, sortedKets.length);
  const ketStartRow = 24;
  const ketEndRow = ketStartRow + ketSlotCount - 1;
  let listedKetSum = 0;

  for (let i = 0; i < ketSlotCount; i++) {
    const rIdx = ketStartRow + i;
    const row = ws2.getRow(rIdx);
    const entry = sortedKets[i];
    const cA = row.getCell(1);
    const cB = row.getCell(2);

    cA.value = entry ? entry.name : null;
    cA.font = FONT_INPUT;
    cA.fill = FILL_INPUT;
    cA.border = BORDER_ALL_THIN;

    if (entry) listedKetSum += entry.total;
    cB.value = {
      formula: `IF(A${rIdx}="","",SUMIF('Rekap Harian'!$J$5:$J$${lastDataRow},A${rIdx},'Rekap Harian'!$K$5:$K$${lastDataRow}))`,
      result: entry ? entry.total : "",
    };
    cB.numFmt = NUM_FMT;
    cB.font = FONT_AUTO;
    cB.fill = FILL_NONE;
    cB.border = BORDER_ALL_THIN;
  }

  setSummaryRow(
    ketEndRow + 1,
    "Lainnya (belum terdaftar di atas)",
    { formula: `B12-SUM(B${ketStartRow}:B${ketEndRow})`, result: sumKeluar - listedKetSum },
    true,
  );

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
