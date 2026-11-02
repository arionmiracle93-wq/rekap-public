import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import ExcelJS from "exceljs";
import { cleanDay } from "@/lib/calc";
import { buildCsv } from "@/lib/csv";
import { DDL } from "@/lib/ddl";
import { parseTemplate } from "@/lib/importXlsx";
import { deleteDay, existingDates, getModal, getMonth, getRange, isLocked, saveDay, setLock, setModal, setQueriesDb } from "@/lib/queries";
import { buildXlsx } from "@/lib/xlsx";

async function main() {
  const pg = new PGlite();
  for (const s of DDL) await pg.exec(s);
  setQueriesDb(drizzle(pg) as unknown as NodePgDatabase<Record<string, never>>);

  // 1. Kosong di awal
  const m0 = await getMonth("2026-11");
  assert.equal(m0.modal, 200000);
  assert.deepEqual(m0.days, {});

  // 2. Simpan 1 Nov 2026 (angka dari template Excel contoh)
  await saveDay(
    "2026-11-01",
    cleanDay({
      cash: 590000, qs: 100000, qd: 527000, tf: 815000, lapM: 2032000,
      items: [{ n: "token listrik", v: 103000 }, { n: "Bensin", v: 20000 }],
    }),
    "Dewi",
  );
  const m1 = await getMonth("2026-11");
  assert.equal(m1.days["2026-11-01"].cash, 590000);
  assert.equal(m1.days["2026-11-01"].items.length, 2);

  // 3. Timpa hari yang sama + lebih dari 6 item pengeluaran
  const ten = Array.from({ length: 10 }, (_, i) => ({ n: `Item ${i + 1}`, v: 5000 }));
  await saveDay("2026-11-01", cleanDay({ cash: 100000, items: ten }), "Budi");
  assert.equal((await getMonth("2026-11")).days["2026-11-01"].items.length, 10);

  // 4. Ubah modal per bulan: bulan lama tetap, bulan baru ikut bulan sebelumnya
  await saveDay("2026-10-15", cleanDay({ cash: 50000 }), "Dewi"); // dibuat saat modal masih 200.000
  await setModal("2026-11", 300000);
  assert.equal((await getMonth("2026-10")).modal, 200000); // Oktober tidak ikut berubah
  assert.equal((await getMonth("2026-11")).modal, 300000);
  assert.equal((await getMonth("2026-12")).modal, 300000); // Desember otomatis ikut November
  assert.equal(await getModal("2026-09"), 200000); // sebelum Oktober tetap nilai awal

  // 5. Rentang lintas tahun + CSV (pakai modal masing-masing bulan)
  await saveDay("2026-03-10", cleanDay({ cash: 250000, tal: 50000, sumber: "Owner" }), "Dewi");
  const r = await getRange("2026-01-01", "2026-12-31");
  assert.deepEqual(Object.keys(r.days), ["2026-03-10", "2026-10-15", "2026-11-01"]);
  assert.equal(r.modals["2026-10"], 200000);
  assert.equal(r.modals["2026-11"], 300000);
  const csv = buildCsv(r.modals, r.days);
  assert.ok(csv.startsWith("\uFEFFTanggal;Hari;Cash;"));
  assert.ok(csv.includes("2026-10-15;Kamis;50000;"));
  assert.ok(csv.includes(";200000;;;250000;")); // 15 Okt: modal 200rb -> laci 250rb
  assert.ok(csv.includes("TOTAL;;400000;"));

  // 6. Kunci bulan
  assert.equal(await isLocked("2026-11"), false);
  await setLock("2026-11", true, "Dewi");
  assert.equal((await getMonth("2026-11")).locked, true);
  await setLock("2026-11", false, "Dewi");
  assert.equal(await isLocked("2026-11"), false);

  // 7. Hapus
  await deleteDay("2026-11-01");
  assert.equal((await getMonth("2026-11")).days["2026-11-01"], undefined);

  // 8. Impor dari file template Excel asli + cek tanggal terisi
  const parsed = await parseTemplate(readFileSync("Rekap_Kas_Nov_2026.xlsx"));
  assert.equal(parsed.fileModal, 200000);
  assert.deepEqual(Object.keys(parsed.days), ["2026-11-01"]);
  const d1 = parsed.days["2026-11-01"];
  assert.equal(d1.cash, 590000);
  assert.equal(d1.qs, 100000);
  assert.equal(d1.qd, 527000);
  assert.equal(d1.tf, 815000);
  assert.deepEqual(d1.items, [{ n: "token listrik", v: 103000 }, { n: "Bensin", v: 20000 }]);
  await saveDay("2026-11-01", d1, "Dewi");
  assert.equal((await existingDates("2026-11-01", "2026-11-30")).has("2026-11-01"), true);

  // 9. Impor tahan kustomisasi: lebih dari 6 item per hari & urutan kolom ditukar
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Rekap Harian");
  ws.getRow(2).values = [undefined, "Modal kasir harian:", 350000];
  ws.getRow(4).values = [undefined, "Tanggal", "Transfer", "Cash", "Nominal (Rp)", "Item Pengeluaran", "Sumber Talangan", "Talangan"];
  ws.getRow(5).values = [undefined, new Date("2026-12-01T00:00:00Z"), 50000, 200000, 1000, "Item 1", "Owner", 25000];
  for (let i = 2; i <= 8; i++) ws.getRow(4 + i).values = [undefined, undefined, undefined, undefined, i * 1000, `Item ${i}`];
  ws.mergeCells(5, 1, 12, 1); // tanggal di-merge 8 baris seperti template
  ws.getRow(13).values = [undefined, new Date("2026-12-02T00:00:00Z"), 0, 100000];
  ws.getRow(21).values = [undefined, "TOTAL", 50000, 300000, 36000];
  const custom = await parseTemplate((await wb.xlsx.writeBuffer()) as ArrayBuffer);
  assert.equal(custom.fileModal, 350000);
  assert.equal(custom.days["2026-12-01"].cash, 200000);
  assert.equal(custom.days["2026-12-01"].tf, 50000);
  assert.equal(custom.days["2026-12-01"].tal, 25000);
  assert.equal(custom.days["2026-12-01"].sumber, "Owner");
  assert.equal(custom.days["2026-12-01"].items.length, 8);
  assert.equal(custom.days["2026-12-02"].cash, 100000);

  // 10. Ekspor Excel (.xlsx) sesuai format template & uji round-trip impor kembali
  const nov = await getMonth("2026-11");
  const xlsxBuf = await buildXlsx({ month: "2026-11", modal: nov.modal, days: nov.days });
  const wbExport = new ExcelJS.Workbook();
  await wbExport.xlsx.load(xlsxBuf as unknown as ExcelJS.Buffer);
  assert.deepEqual(wbExport.worksheets.map((w) => w.name), ["Rekap Harian", "Ringkasan"]);
  const wsRekap = wbExport.getWorksheet("Rekap Harian")!;
  assert.equal(wsRekap.getCell("A1").value, "Rekap Kas Harian - November 2026");
  assert.equal(wsRekap.getCell("C3").value, 300000);
  assert.equal(wsRekap.getCell("A185").value, "TOTAL");
  const roundTrip = await parseTemplate(xlsxBuf);
  assert.equal(roundTrip.fileModal, 300000);
  assert.deepEqual(roundTrip.days["2026-11-01"], nov.days["2026-11-01"]);

  await pg.close();
  console.log("Semua uji SQL & Excel lulus.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
