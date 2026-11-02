/** Uji alur SQL + hitungan memakai PostgreSQL-WASM (tanpa database online). Jalankan: npm test */
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import ExcelJS from "exceljs";
import { DDL } from "../src/lib/ddl";
import { buildCsv } from "../src/lib/csv";
import { parseTemplate } from "../src/lib/importXlsx";
import { blankDay, calc, cleanDay, rangeOk, resolveModal } from "../src/lib/calc";
import { deleteDay, existingDates, getModal, getMonth, getRange, isLocked, saveDay, setLock, setModal, setQueriesDb } from "../src/lib/queries";

async function main() {
  const pdb = drizzle(new PGlite());
  for (let round = 0; round < 2; round++) for (const s of DDL) await pdb.execute(sql.raw(s)); // aman diulang
  setQueriesDb(pdb as unknown as Parameters<typeof setQueriesDb>[0]);

  // Data contoh dari template Excel: 1 Nov 2026
  const day = cleanDay({
    cash: 590000, qs: 100000, qd: 527000, tf: 815000, lapM: 2032000, lapS: 467000,
    items: [{ n: "Token listrik", v: 103000 }, { n: "Bensin", v: 20000 }, { n: "", v: null }],
  });
  assert.equal(day.items.length, 2);
  assert.equal(cleanDay({ items: Array.from({ length: 40 }, (_, i) => ({ n: `x${i}`, v: i })) }).items.length, 30); // batas item
  await saveDay("2026-11-01", day, "Tes");
  await saveDay("2026-11-01", { ...day, tal: 5000, sumber: "Owner" }, "Tes"); // upsert
  await saveDay("2026-12-01", day, "Tes");

  const m = await getMonth("2026-11");
  assert.deepEqual(Object.keys(m.days), ["2026-11-01"]);
  assert.equal(m.modal, 200000);
  const c = calc(m.days["2026-11-01"], m.modal);
  assert.equal(c.masuk, 2032000);
  assert.equal(c.keluar, 123000);
  assert.equal(c.saldo, 467000);
  assert.equal(c.laci, 200000 + 590000 - 123000 + 5000);
  assert.equal(c.selM, 0);
  assert.equal(c.selS, 0);
  assert.equal(m.days["2026-11-01"].sumber, "Owner");

  // Ekspor CSV
  const csv = buildCsv(m.modal, m.days);
  assert.ok(csv.startsWith("\uFEFFTanggal;"));
  assert.ok(csv.includes("2026-11-01;Minggu;590000;100000;527000;815000;2032000"));
  assert.ok(buildCsv(1, { "2026-11-02": { ...blankDay(), cash: 1, items: [{ n: "=HYPERLINK(1)", v: 5 }] } }).includes("'=HYPERLINK"));

  // Kunci bulan + cek tanggal terisi
  assert.equal(m.locked, false);
  await setLock("2026-11", true, "Tes");
  assert.equal(await isLocked("2026-11"), true);
  assert.equal((await getMonth("2026-11")).locked, true);
  assert.equal((await existingDates("2026-11-01", "2026-11-30")).has("2026-11-01"), true);
  await setLock("2026-11", false, "Tes");
  assert.equal(await isLocked("2026-11"), false);

  // Rentang (tahunan / periode)
  const rg = await getRange("2026-01-01", "2026-12-31");
  assert.deepEqual(Object.keys(rg.days), ["2026-11-01", "2026-12-01"]);
  assert.deepEqual(Object.keys((await getRange("2026-11-02", "2026-11-30")).days), []);
  assert.ok(rangeOk("2026-01-01", "2026-12-31") && !rangeOk("2026-12-31", "2026-01-01") && !rangeOk("2020-01-01", "2026-01-01"));

  // Impor: buat file .xlsx mini dengan layout template, lalu parse
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Rekap Harian");
  ws.getCell(3, 3).value = 200000;
  ws.getCell(5, 1).value = new Date(Date.UTC(2026, 10, 1));
  ws.getCell(5, 3).value = 590000;
  ws.getCell(5, 7).value = { formula: "SUM(C5:F5)", result: 590000 };
  ws.getCell(5, 10).value = "token listrik";
  ws.getCell(5, 11).value = 103000;
  ws.getCell(6, 10).value = "Bensin";
  ws.getCell(6, 11).value = 20000;
  ws.getCell(5, 14).value = 5000;
  ws.getCell(5, 15).value = "owner";
  ws.getCell(11, 1).value = new Date(Date.UTC(2026, 10, 2)); // hari kosong: dilewati
  const parsed = await parseTemplate((await wb.xlsx.writeBuffer()) as ArrayBuffer);
  assert.deepEqual(Object.keys(parsed.days), ["2026-11-01"]);
  assert.equal(parsed.days["2026-11-01"].items.length, 2);
  assert.equal(parsed.days["2026-11-01"].sumber, "Owner");
  assert.equal(parsed.fileModal, 200000);

  // Impor fleksibel: header + urutan kolom beda, blok 10 baris per hari, 9 item, baris TOTAL di bawah
  const wb2 = new ExcelJS.Workbook();
  const w2 = wb2.addWorksheet("Rekap");
  w2.getCell(2, 1).value = "Modal kasir harian (Rp)";
  w2.getCell(2, 2).value = 300000;
  ["Tanggal", "Cash", "Item Pengeluaran", "Nominal (Rp)"].forEach((h, i) => (w2.getCell(3, i + 1).value = h));
  w2.getCell(4, 1).value = new Date(Date.UTC(2026, 10, 1));
  w2.getCell(4, 2).value = 100000;
  for (let i = 0; i < 9; i++) { w2.getCell(4 + i, 3).value = `item ${i + 1}`; w2.getCell(4 + i, 4).value = 1000 * (i + 1); }
  w2.mergeCells("A4:A13"); // seperti template asli: tanggal di-merge per blok
  w2.getCell(14, 1).value = new Date(Date.UTC(2026, 10, 2));
  w2.getCell(14, 2).value = 5000;
  w2.getCell(16, 1).value = "TOTAL";
  w2.getCell(16, 3).value = "bukan item";
  const p2 = await parseTemplate((await wb2.xlsx.writeBuffer()) as ArrayBuffer);
  assert.equal(p2.days["2026-11-01"].items.length, 9);
  assert.equal(p2.days["2026-11-01"].qs, null); // kolom yang tidak ada di header tidak salah baca
  assert.equal(p2.days["2026-11-02"].items.length, 0);
  assert.equal(p2.days["2026-11-02"].cash, 5000);
  assert.equal(p2.fileModal, 300000);

  // Modal per bulan: mengubah satu bulan tidak menggeser bulan lain yang sudah berisi data
  assert.equal(resolveModal("2026-05", {}, 111), 111);
  assert.equal(resolveModal("2026-05", { "2026-03": 1, "2026-04": 2, "2026-06": 3 }, 111), 2);
  assert.equal(resolveModal("2026-06", { "2026-06": 3 }, 111), 3);
  assert.equal(resolveModal("2026-02", { "2026-03": 1 }, 111), 111);
  assert.equal((await getMonth("2026-12")).modal, 200000); // Des sudah punya data (saveDay di atas) -> ikut nilai awal
  await setModal("2026-11", 250000);
  assert.equal((await getMonth("2026-11")).modal, 250000);
  assert.equal((await getMonth("2026-12")).modal, 200000, "bulan lain tidak boleh ikut berubah");
  assert.equal(await getModal("2027-03"), 200000, "bulan baru ikut bulan terdekat sebelumnya (Des)");
  const rg2 = await getRange("2026-10-15", "2027-01-05");
  assert.deepEqual(rg2.modals, { "2026-10": 200000, "2026-11": 250000, "2026-12": 200000, "2027-01": 200000 });
  assert.ok(buildCsv(rg2.modals, { "2026-11-01": day }).includes(";250000;")); // modal bulan Nov di CSV rentang

  // Data lama (versi sebelumnya: satu modal global, belum ada nilai per bulan) tidak boleh bergeser
  await pdb.execute(sql`INSERT INTO settings (key, value) VALUES ('modal', '180000') ON CONFLICT (key) DO UPDATE SET value = '180000'`);
  await pdb.execute(sql`INSERT INTO daily_recaps (day, cash, items) VALUES ('2025-05-01'::date, 1000, '[]'::jsonb), ('2025-06-01'::date, 1000, '[]'::jsonb)`);
  assert.equal(await getModal("2025-05"), 180000);
  assert.equal(await getModal("2025-06"), 180000);
  await setModal("2025-06", 220000);
  assert.equal(await getModal("2025-05"), 180000, "data lama tetap memakai modal lama");
  assert.equal(await getModal("2025-06"), 220000);
  assert.equal(await getModal("2025-07"), 220000, "bulan baru ikut bulan sebelumnya");
  await setModal("2025-05", 190000);
  assert.equal(await getModal("2025-06"), 220000);
  await pdb.execute(sql`DELETE FROM daily_recaps WHERE day IN ('2025-05-01'::date, '2025-06-01'::date)`);

  await deleteDay("2026-11-01");
  assert.deepEqual(Object.keys((await getMonth("2026-11")).days), []);
  console.log("verify-sql: OK");
}
main().catch((e) => { console.error(e); process.exit(1); });
