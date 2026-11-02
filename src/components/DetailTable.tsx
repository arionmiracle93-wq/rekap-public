import { Fragment } from "react";
import { BLN, HARI, calc, fmt, status, type Day } from "@/lib/calc";

/** Tabel detail satu bulan: kolom dan urutannya sama persis dengan sheet "Rekap Harian" di Excel. */

// Kolom bertanda true = angka (rata kanan)
const COLS: [string, boolean][] = [
  ["Tanggal", false], ["Hari", false], ["Cash", true], ["QRIS Statis", true], ["QRIS Dinamis (Majoo)", true], ["Transfer", true],
  ["Total Pemasukan (hitung)", true], ["Total Pemasukan (laporan)", true], ["Selisih Total", true],
  ["Item Pengeluaran", false], ["Nominal (Rp)", true], ["Total Pengeluaran", true],
  ["Modal Awal", true], ["Talangan / Tambahan Kas", true], ["Sumber Talangan", false],
  ["Uang di Laci Akhir Hari", true], ["Saldo Cash (hitung)", true], ["Saldo Cash (laporan)", true], ["Selisih Saldo", true],
];

const dobj = (k: string) => {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const val = (n: number | null) => (n == null ? "–" : `${n < 0 ? "−" : ""}${fmt(Math.abs(n))}`);
const diff = (n: number | null) =>
  n == null ? "–" : n === 0 ? <em className="ok">Cocok</em> : <em className="warn">{n > 0 ? "+" : "−"}{fmt(Math.abs(n))}</em>;

type Props = {
  keys: string[];
  days: Record<string, Day>;
  modal: number;
  today: string;
  onlyFilled: boolean;
  onOpen: (key: string) => void;
};

export function DetailTable({ keys, days, modal, today, onlyFilled, onOpen }: Props) {
  const shown = onlyFilled ? keys.filter((k) => days[k]) : keys;

  // Baris TOTAL di bawah, seperti baris TOTAL di Excel
  const tot = (f: (d: Day, c: ReturnType<typeof calc>) => number | null) =>
    keys.reduce((a, k) => (days[k] ? a + (f(days[k], calc(days[k], modal)) ?? 0) : a), 0);
  const totals: (number | null)[] = [
    tot((d) => d.cash), tot((d) => d.qs), tot((d) => d.qd), tot((d) => d.tf),
    tot((_, c) => c.masuk), tot((d) => d.lapM), tot((_, c) => c.selM),
  ];
  const keluar = tot((_, c) => c.keluar);

  return (
    <div className="dtw">
      <table className="dt">
        <thead>
          <tr>{COLS.map(([l, n], i) => <th key={l} scope="col" className={`${n ? "n" : ""}${i === 0 ? " dc" : ""}`}>{l}</th>)}</tr>
        </thead>
        <tbody>
          {shown.map((k) => {
            const dt = dobj(k);
            const label = `${dt.getDate()} ${BLN[dt.getMonth()].slice(0, 3)}`;
            const d = days[k];
            const dateBtn = (s: string | null, span: number) => (
              <th scope="row" rowSpan={span} className={`dc ${s ?? ""} ${today === k ? "today" : ""}`}>
                <button type="button" onClick={() => onOpen(k)} aria-label={`Buka rekap ${label} ${dt.getFullYear()}`}>{label}</button>
              </th>
            );

            if (!d) {
              return (
                <tr key={k} className="empty">
                  {dateBtn(null, 1)}
                  <td className="mt">{HARI[dt.getDay()]}</td>
                  <td className="mt" colSpan={COLS.length - 2}>Belum ada rekap</td>
                </tr>
              );
            }

            const c = calc(d, modal);
            const s = status(c);
            const rows = d.items.length ? d.items : [null];
            const n = rows.length;
            return (
              <Fragment key={k}>
                {rows.map((it, i) => (
                  <tr key={i} className={i < n - 1 ? "sub" : ""}>
                    {i === 0 && (
                      <>
                        {dateBtn(s, n)}
                        <td rowSpan={n}>{HARI[dt.getDay()]}</td>
                        <td rowSpan={n} className="n">{val(d.cash)}</td>
                        <td rowSpan={n} className="n">{val(d.qs)}</td>
                        <td rowSpan={n} className="n">{val(d.qd)}</td>
                        <td rowSpan={n} className="n">{val(d.tf)}</td>
                        <td rowSpan={n} className="n">{val(c.masuk)}</td>
                        <td rowSpan={n} className="n">{val(d.lapM)}</td>
                        <td rowSpan={n} className="n">{diff(c.selM)}</td>
                      </>
                    )}
                    <td>{it ? it.n || "Tanpa keterangan" : "–"}</td>
                    <td className="n">{val(it ? it.v : null)}</td>
                    {i === 0 && (
                      <>
                        <td rowSpan={n} className="n">{val(c.keluar)}</td>
                        <td rowSpan={n} className="n">{val(c.has ? modal : null)}</td>
                        <td rowSpan={n} className="n">{val(d.tal)}</td>
                        <td rowSpan={n}>{d.tal != null ? d.sumber : "–"}</td>
                        <td rowSpan={n} className={`n${(c.laci ?? 0) < 0 ? " neg" : ""}`}>{val(c.laci)}</td>
                        <td rowSpan={n} className="n">{val(c.saldo)}</td>
                        <td rowSpan={n} className="n">{val(d.lapS)}</td>
                        <td rowSpan={n} className="n">{diff(c.selS)}</td>
                      </>
                    )}
                  </tr>
                ))}
              </Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className="dc">TOTAL</th>
            <td />
            {totals.map((t, i) => <td key={i} className="n">{i === 6 ? diff(t) : val(t)}</td>)}
            <td />
            <td className="n">{val(keluar)}</td>
            <td className="n">{val(keluar)}</td>
            <td />
            <td className="n">{val(tot((d) => d.tal))}</td>
            <td />
            <td />
            <td className="n">{val(tot((_, c) => c.saldo))}</td>
            <td className="n">{val(tot((d) => d.lapS))}</td>
            <td className="n">{diff(tot((_, c) => c.selS))}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
