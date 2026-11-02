"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, House, Lock, PieChart, Plus, Settings, Table, Trash2, Wallet, X } from "lucide-react";
import { BLN, HARI, MAX_ITEMS, SRC, blankDay, calc, fmt, num, rp, status, type Day, type NumKey } from "@/lib/calc";
import { DetailTable } from "@/components/DetailTable";

type Data = { modal: number; locked: boolean; days: Record<string, Day> };
type Preview = { file: File; found: number; importable: number; skipped: number; overwrite: number; modalNote: string };
type Tab = "beranda" | "kalender" | "detail" | "ringkasan" | "pengaturan";
type Calc = ReturnType<typeof calc>;

const pad = (n: number) => String(n).padStart(2, "0");
const monthOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const todayKey = () => `${monthOf(new Date())}-${pad(new Date().getDate())}`;
const shift = (m: string, by: number) => {
  const [y, mo] = m.split("-").map(Number);
  return monthOf(new Date(y, mo - 1 + by, 1));
};
const daysOf = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return Array.from({ length: new Date(y, mo, 0).getDate() }, (_, i) => `${m}-${pad(i + 1)}`);
};
const dobj = (k: string) => {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (k: string, n: number) => {
  const d = dobj(k);
  d.setDate(d.getDate() + n);
  return `${monthOf(d)}-${pad(d.getDate())}`;
};
const longDate = (k: string) => `${dobj(k).getDate()} ${BLN[dobj(k).getMonth()]} ${dobj(k).getFullYear()}`;
const msg = (e: unknown) => (e instanceof Error ? e.message : "Terjadi kesalahan.");
const LABEL = { ok: "Aman", warn: "Selisih", bad: "Kurang" } as const;

async function api(url: string, method = "GET", body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await r.json().catch(() => ({ ok: false, error: "Respons server tidak terbaca." }));
  if (!j.ok) throw new Error(j.error || "Terjadi kesalahan.");
  return j;
}

function monthStats(keys: string[], days: Record<string, Day>, modal: number | Record<string, number>) {
  const t = { cash: 0, qs: 0, qd: 0, tf: 0, keluar: 0 };
  const src: Record<string, number> = Object.fromEntries(SRC.map((s) => [s, 0]));
  const ket = new Map<string, { n: string; v: number }>();
  const filled: string[] = [];
  let issue = 0;
  for (const k of keys) {
    const d = days[k], c = calc(d, typeof modal === "number" ? modal : modal[k.slice(0, 7)] ?? 0);
    if (!d || !c.has) continue;
    filled.push(k);
    if (status(c) !== "ok") issue++;
    t.cash += d.cash ?? 0; t.qs += d.qs ?? 0; t.qd += d.qd ?? 0; t.tf += d.tf ?? 0; t.keluar += c.keluar ?? 0;
    if (c.tal) src[d.sumber] = (src[d.sumber] ?? 0) + c.tal;
    for (const i of d.items) {
      if (i.v == null) continue;
      const key = (i.n || "Tanpa keterangan").toLowerCase();
      const e = ket.get(key) ?? { n: i.n || "Tanpa keterangan", v: 0 };
      e.v += i.v;
      ket.set(key, e);
    }
  }
  return { t, src, filled, issue, masuk: t.cash + t.qs + t.qd + t.tf, kets: [...ket.values()].sort((a, b) => b.v - a.v) };
}

const Row = ({ a, b, cls = "" }: { a: string; b: string; cls?: string }) => <div className={`row ${cls}`}><span>{a}</span><b>{b}</b></div>;
const selisih = (n: number | null) => (n == null ? "–" : n === 0 ? <em className="ok">Cocok</em> : <em className="warn">{n > 0 ? "+" : "−"}Rp {fmt(Math.abs(n))}</em>);

function Bars({ items, limit, green }: { items: { n: string; v: number }[]; limit?: number; green?: boolean }) {
  const tot = items.reduce((a, e) => a + e.v, 0) || 1;
  if (!items.length) return <p className="note">Belum ada data bulan ini.</p>;
  return <>{items.slice(0, limit).map((e) => (
    <div className="kt" key={e.n}>
      <div className="kt-h"><span>{e.n}</span><b>{rp(e.v)}</b><i>{Math.round((e.v / tot) * 100)}%</i></div>
      <div className={`bar ${green ? "g" : ""}`}><span style={{ width: `${(e.v / tot) * 100}%` }} /></div>
    </div>
  ))}</>;
}

const FIELDS: [NumKey, string][] = [["cash", "Cash"], ["qs", "QRIS Statis"], ["qd", "QRIS Dinamis (Majoo)"], ["tf", "Transfer"], ["lapM", "Total pemasukan menurut laporan"]];
const NAV: [Tab, string, typeof House][] = [["beranda", "Beranda", House], ["kalender", "Kalender", CalendarDays], ["detail", "Detail", Table], ["ringkasan", "Ringkasan", PieChart], ["pengaturan", "Pengaturan", Settings]];

export function RekapApp() {
  const [tab, setTab] = useState<Tab>("beranda");
  const [onlyFilled, setOnlyFilled] = useState(false);
  const [month, setMonth] = useState(() => monthOf(new Date()));
  const [data, setData] = useState<Data>({ modal: 200000, locked: false, days: {} });
  const [err, setErr] = useState("");
  const [sel, setSel] = useState("");
  const [tick, setTick] = useState(0);
  const [rmode, setRmode] = useState<"bulan" | "tahun" | "periode">("bulan");
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [from, setFrom] = useState(() => addDays(todayKey(), -29));
  const [to, setTo] = useState(() => todayKey());
  const [rdata, setRdata] = useState<{ modals: Record<string, number>; days: Record<string, Day> }>({ modals: {}, days: {} });
  const [cur, setCur] = useState("");
  const [draft, setDraft] = useState<Day>(blankDay());
  const [sec, setSec] = useState(0);
  const [focusIdx, setFocusIdx] = useState(-1);
  const [sure, setSure] = useState(false);
  const [derr, setDerr] = useState("");
  const [imp, setImp] = useState<Preview | null>(null);
  const [impMsg, setImpMsg] = useState("");
  const [theme, setThemeState] = useState(() => (document.documentElement.dataset.theme === "light" ? "light" : "dark"));
  const dlg = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const reload = () => setTick((t) => t + 1);

  useEffect(() => {
    let alive = true;
    api(`/api/month?m=${month}`)
      .then((j) => {
        if (!alive) return;
        setData({ modal: j.modal, locked: j.locked, days: j.days });
        setErr("");
      })
      .catch((e) => alive && setErr(msg(e)));
    return () => {
      alive = false;
    };
  }, [month, tick]);

  useEffect(() => {
    if (rmode === "bulan") return;
    const [f, t] = rmode === "tahun" ? [`${year}-01-01`, `${year}-12-31`] : [from, to];
    let alive = true;
    api(`/api/range?from=${f}&to=${t}`)
      .then((j) => {
        if (!alive) return;
        setRdata({ modals: j.modals, days: j.days });
        setErr("");
      })
      .catch((e) => alive && setErr(msg(e)));
    return () => {
      alive = false;
    };
  }, [rmode, year, from, to, tick]);

  const keys = daysOf(month);
  const st = monthStats(keys, data.days, data.modal);
  const [y, mo] = month.split("-").map(Number);
  const today = todayKey();
  const selKey = sel.startsWith(month) ? sel : today.startsWith(month) ? today : keys[0];
  const fabKey = tab === "kalender" ? selKey : today.startsWith(month) ? today : keys[0];

  const set = <K extends keyof Day>(k: K, v: Day[K]) => setDraft((p) => ({ ...p, [k]: v }));
  const setItem = (i: number, patch: Partial<Day["items"][number]>) => setDraft((p) => ({ ...p, items: p.items.map((it, x) => (x === i ? { ...it, ...patch } : it)) }));

  function loadDraft(k: string) {
    const d = data.days[k] ?? blankDay();
    setCur(k);
    setDraft({ ...d, items: d.items.length ? d.items : [{ n: "", v: null }] });
    setFocusIdx(-1);
    setSure(false);
    setDerr("");
  }
  const addItem = () => {
    setFocusIdx(draft.items.length);
    setDraft((p) => ({ ...p, items: [...p.items, { n: "", v: null }] }));
  };
  const removeItem = (i: number) =>
    setDraft((p) => ({ ...p, items: p.items.length > 1 ? p.items.filter((_, x) => x !== i) : [{ n: "", v: null }] }));

  function openSheet(k: string) {
    loadDraft(k);
    setSec(0);
    dlg.current?.showModal();
  }
  async function save() {
    try {
      await api("/api/day", "PUT", { date: cur, day: draft });
      dlg.current?.close();
      setSel(cur);
      reload();
    } catch (e) {
      setDerr(msg(e));
    }
  }
  async function clear() {
    if (!sure) return setSure(true);
    try {
      await api(`/api/day?date=${cur}`, "DELETE");
      dlg.current?.close();
      reload();
    } catch (e) {
      setDerr(msg(e));
    }
  }
  async function saveModal(v: string) {
    const n = num(v);
    if (n == null || n < 0 || n === data.modal) return;
    try {
      await api("/api/settings", "PUT", { month, modal: n });
      reload();
    } catch (e) {
      setErr(msg(e));
    }
  }
  async function toggleLock() {
    try {
      await api("/api/lock", "PUT", { month, locked: !data.locked });
      reload();
    } catch (e) {
      setErr(msg(e));
    }
  }
  async function upload(file: File, dry: boolean) {
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch(`/api/import${dry ? "?dry=1" : ""}`, { method: "POST", body: fd });
    const j = await r.json().catch(() => ({ ok: false, error: "Respons server tidak terbaca." }));
    if (!j.ok) throw new Error(j.error || "Gagal impor.");
    return j;
  }
  async function pickFile(file?: File) {
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setImp(null);
    setImpMsg("");
    try {
      const j = await upload(file, true);
      const modalNote = j.fileModal != null && j.fileModal !== j.modal ? `Modal di file Rp ${fmt(j.fileModal)} beda dengan modal ${BLN[Number(j.firstMonth.slice(5)) - 1]} di aplikasi Rp ${fmt(j.modal)} (modal aplikasi tidak diubah).` : "";
      setImp({ file, found: j.found, importable: j.importable, skipped: j.skipped, overwrite: j.overwrite, modalNote });
    } catch (e) {
      setImpMsg(msg(e));
    }
  }
  async function runImport() {
    if (!imp) return;
    try {
      const j = await upload(imp.file, false);
      setImp(null);
      setImpMsg(`${j.imported} hari berhasil diimpor.${j.skipped ? ` ${j.skipped} hari dilewati karena bulannya terkunci.` : ""}`);
      setMonth(j.firstMonth);
      reload();
    } catch (e) {
      setImpMsg(msg(e));
    }
  }
  function setTheme(t: "dark" | "light") {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem("rk_tema", t); } catch { /* tema tetap berlaku di sesi ini */ }
    setThemeState(t);
  }
  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const live = calc(draft, data.modal);
  const TITLES: Record<Tab, string> = { beranda: "Beranda", kalender: "Kalender", detail: "Detail", ringkasan: "Ringkasan", pengaturan: "Pengaturan" };
  const recent = [...st.filled].reverse().slice(0, 4);

  // ---------- tampilan per tab
  const beranda = (
    <>
      {data.locked && <div className="lockn"><Lock size={16} />Bulan ini terkunci, data tidak bisa diubah.</div>}
      <div className="hero">
        <Image className="hero-art" src="/dompet.png" alt="" width={252} height={236} priority />
        <p className="lbl">Saldo Cash Bulan Ini</p>
        <p className="big">{rp(st.t.cash - st.t.keluar)}</p>
        <p className="sub">Cash masuk − pengeluaran</p>
        <div className="minis">
          <div className="mini"><span>Pemasukan</span><b className="in">{rp(st.masuk)}</b></div>
          <div className="mini"><span>Pengeluaran</span><b className="out">{rp(st.t.keluar)}</b></div>
        </div>
      </div>
      <div className="cols"><div>
      <div className="minis">
        <div className="stat"><span>Hari terisi</span><b>{st.filled.length} / {keys.length}</b></div>
        <button type="button" className="stat" onClick={() => setTab("kalender")}><span>Perlu dicek</span><b className={st.issue ? "warnt" : ""}>{st.issue} hari</b></button>
      </div>
      <div className="sh"><h2>Pengeluaran per Keterangan</h2><button type="button" onClick={() => setTab("ringkasan")}>Lihat semua</button></div>
      <div className="card"><Bars items={st.kets} limit={4} /></div>
      </div><div>
      <div className="sh"><h2>Rekap Terbaru</h2><button type="button" onClick={() => setTab("kalender")}>Kalender</button></div>
      <div className="card flush">
        {recent.length ? recent.map((k) => {
          const c = calc(data.days[k], data.modal), s = status(c)!;
          return (
            <button type="button" className="rw" key={k} onClick={() => openSheet(k)}>
              <span className="d">{dobj(k).getDate()} {BLN[dobj(k).getMonth()].slice(0, 3)}<small>{HARI[dobj(k).getDay()]}</small></span>
              <span className="m">Masuk <b>{rp(c.masuk ?? 0)}</b><br />Keluar <b>{rp(c.keluar ?? 0)}</b></span>
              <span className={`chip ${s}`}>{LABEL[s]}</span>
            </button>
          );
        }) : <p className="note" style={{ padding: 12 }}>Belum ada rekap. Ketuk tombol + untuk mulai.</p>}
      </div>
      </div></div>
    </>
  );

  const offset = (dobj(keys[0]).getDay() + 6) % 7;
  const sc = calc(data.days[selKey], data.modal), ss = status(sc);
  const kalender = (
    <div className="cols cal-cols">
      <div>
      <div className="card">
        <div className="cal-h">{["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((h) => <span key={h}>{h}</span>)}</div>
        <div className="cal-g">
          {Array.from({ length: offset }, (_, i) => <span key={`b${i}`} />)}
          {keys.map((k) => {
            const s = status(calc(data.days[k], data.modal));
            return (
              <button type="button" key={k} className={`cal ${selKey === k ? "on" : ""} ${today === k ? "today" : ""}`} onClick={() => setSel(k)} aria-label={longDate(k)}>
                {dobj(k).getDate()}{s && <i className={`dot ${s}`} />}
              </button>
            );
          })}
        </div>
      </div>
      <div className="legend"><span><i style={{ background: "var(--ok)" }} />Aman</span><span><i style={{ background: "var(--warn)" }} />Selisih</span><span><i style={{ background: "var(--bad)" }} />Kurang</span></div>
      </div>
      <div>
      <div className="card">
        <h2>{HARI[dobj(selKey).getDay()]}, {longDate(selKey)} {ss && <span className={`chip ${ss}`}>{LABEL[ss]}</span>}</h2>
        {sc.has ? (
          <>
            <Row a="Pemasukan" b={rp(sc.masuk)} /><Row a="Pengeluaran" b={rp(sc.keluar ?? 0)} />
            <Row a="Saldo cash" b={rp(sc.saldo)} /><Row a="Uang di laci" b={rp(sc.laci)} cls={(sc.laci ?? 0) < 0 ? "tot neg" : "tot"} />
          </>
        ) : <p className="note">Belum ada rekap di tanggal ini.</p>}
        <button type="button" className="primary" onClick={() => openSheet(selKey)}>{data.locked ? "Lihat rekap" : sc.has ? "Ubah rekap" : "Isi rekap"}</button>
      </div>
      </div>
    </div>
  );

  const detail = (
    <>
      <div className="seg" style={{ marginBottom: 8 }}>
        {([[false, "Semua tanggal"], [true, "Hanya terisi"]] as const).map(([v, l]) => <button type="button" key={l} aria-pressed={onlyFilled === v} onClick={() => setOnlyFilled(v)}>{l}</button>)}
      </div>
      <p className="note" style={{ marginBottom: 8 }}>Geser ke samping untuk lihat semua kolom. Ketuk tanggal untuk {data.locked ? "melihat" : "mengubah"} rekap.</p>
      <DetailTable keys={keys} days={data.days} modal={data.modal} today={today} onlyFilled={onlyFilled} onOpen={openSheet} />
    </>
  );

  const rkeys = rmode === "bulan" ? keys : Object.keys(rdata.days).sort();
  const rs = rmode === "bulan" ? st : monthStats(rkeys, rdata.days, rdata.modals);
  const rlabel = rmode === "bulan" ? `${BLN[mo - 1]} ${y}` : rmode === "tahun" ? `Tahun ${year}` : `${longDate(from)} – ${longDate(to)}`;
  const span = rmode === "bulan" ? keys.length : Math.round((dobj(rmode === "tahun" ? `${year}-12-31` : to).getTime() - dobj(rmode === "tahun" ? `${year}-01-01` : from).getTime()) / 864e5) + 1;
  const p = rs.masuk + rs.t.keluar > 0 ? (rs.masuk / (rs.masuk + rs.t.keluar)) * 100 : 0;
  const monthly = Array.from({ length: 12 }, (_, i) => {
    const s2 = monthStats(rkeys.filter((k) => k.startsWith(`${year}-${pad(i + 1)}`)), rdata.days, rdata.modals);
    return { l: BLN[i].slice(0, 3), n: BLN[i], masuk: s2.masuk, keluar: s2.t.keluar, has: s2.filled.length > 0 };
  });
  const mx = Math.max(1, ...monthly.flatMap((m) => [m.masuk, m.keluar]));
  const exportHref = rmode === "bulan" ? `/api/export?m=${month}` : rmode === "tahun" ? `/api/export?from=${year}-01-01&to=${year}-12-31` : `/api/export?from=${from}&to=${to}`;
  const ringkasan = (
    <>
      <div className="seg" style={{ marginBottom: 12 }}>
        {(["bulan", "tahun", "periode"] as const).map((m) => <button type="button" key={m} aria-pressed={rmode === m} onClick={() => setRmode(m)}>{m[0].toUpperCase() + m.slice(1)}</button>)}
      </div>
      {rmode === "tahun" && (
        <div className="msw" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <button type="button" aria-label="Tahun sebelumnya" onClick={() => setYear(year - 1)}><ChevronLeft size={18} /></button>
          <span>{year}</span>
          <button type="button" aria-label="Tahun berikutnya" onClick={() => setYear(year + 1)}><ChevronRight size={18} /></button>
        </div>
      )}
      {rmode === "periode" && (
        <div className="card">
          <div className="dates">
            <label>Dari<input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} /></label>
            <label>Sampai<input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} /></label>
          </div>
          <div className="chips">
            {([["7 hari", 7], ["30 hari", 30], ["90 hari", 90]] as const).map(([l, n]) => (
              <button type="button" className="btn2" key={l} onClick={() => { setTo(todayKey()); setFrom(addDays(todayKey(), -(n - 1))); }}>{l} terakhir</button>
            ))}
          </div>
        </div>
      )}
      <div className="cols"><div>
      <div className="card">
        <h2>Pemasukan vs Pengeluaran</h2>
        <p className="sub" style={{ marginBottom: 10 }}>{rlabel}</p>
        <div className="donut-w">
          <div className="donut" style={{ background: p ? `conic-gradient(var(--ok) 0 ${p}%, var(--acc) ${p}% 100%)` : "var(--line)" }} />
          <div className="lg">
            <span><i style={{ background: "var(--ok)" }} />Pemasukan<b>{rp(rs.masuk)}</b></span>
            <span><i style={{ background: "var(--acc)" }} />Pengeluaran<b>{rp(rs.t.keluar)}</b></span>
          </div>
        </div>
      </div>
      <div className="minis">
        <div className="mini"><span>Saldo cash</span><b>{rp(rs.t.cash - rs.t.keluar)}</b></div>
        <div className="mini"><span>Hari terisi</span><b>{rs.filled.length} dari {span} hari</b></div>
      </div>
      {rmode === "tahun" && (
        <>
          <div className="sh"><h2>Tren Bulanan</h2></div>
          <div className="card">
            <div className="trend" role="img" aria-label={`Pemasukan dan pengeluaran per bulan tahun ${year}`}>
              {monthly.map((m) => (
                <div className="tcol" key={m.l}>
                  <div className="tbars"><i className="ti" style={{ height: `${(m.masuk / mx) * 100}%` }} /><i className="to" style={{ height: `${(m.keluar / mx) * 100}%` }} /></div>
                  <span>{m.l}</span>
                </div>
              ))}
            </div>
            <div className="legend" style={{ marginBottom: 0 }}><span><i style={{ background: "var(--ok)" }} />Pemasukan</span><span><i style={{ background: "var(--acc)" }} />Pengeluaran</span></div>
          </div>
          <div className="sh"><h2>Per Bulan</h2></div>
          <div className="card">
            {monthly.some((m) => m.has) ? monthly.filter((m) => m.has).map((m) => (
              <div className="row" key={m.n}><span>{m.n}</span><span><b className="in">{rp(m.masuk)}</b> · <b className="out">{rp(m.keluar)}</b></span></div>
            )) : <p className="note">Belum ada data di tahun ini.</p>}
          </div>
        </>
      )}
      </div><div>
      <div className="sh"><h2>Pemasukan per Metode</h2></div>
      <div className="card"><Bars green items={[{ n: "Cash", v: rs.t.cash }, { n: "QRIS Statis", v: rs.t.qs }, { n: "QRIS Dinamis (Majoo)", v: rs.t.qd }, { n: "Transfer", v: rs.t.tf }].filter((e) => e.v > 0)} /></div>
      <div className="sh"><h2>Pengeluaran per Keterangan</h2></div>
      <div className="card"><Bars items={rs.kets} /></div>
      <div className="sh"><h2>Talangan per Sumber</h2></div>
      <div className="card">
        {Object.entries(rs.src).map(([a, b]) => <Row key={a} a={a} b={rp(b)} />)}
        <Row a="Total talangan" b={rp(Object.values(rs.src).reduce((a, b) => a + b, 0))} cls="tot" />
      </div>
      </div></div>
      <div className="lc"><a className="li" href={exportHref}><span>Ekspor CSV ({rlabel})</span><em>Unduh</em></a></div>
    </>
  );

  const pengaturan = (
    <>
      <p className="grp">Preferensi</p>
      <div className="lc">
        <div className="li"><span>Tema</span>
          <div className="seg">
            <button type="button" aria-pressed={theme === "dark"} onClick={() => setTheme("dark")}>Gelap</button>
            <button type="button" aria-pressed={theme === "light"} onClick={() => setTheme("light")}>Terang</button>
          </div>
        </div>
      </div>
      <p className="grp">Data {BLN[mo - 1]} {y}</p>
      <div className="lc">
        <label className="li"><span>Modal kasir {BLN[mo - 1]} (Rp)</span>
          <input type="number" inputMode="numeric" key={`${month}-${data.modal}`} defaultValue={data.modal} disabled={data.locked} onBlur={(e) => void saveModal(e.target.value)} />
        </label>
        <button type="button" className="li" onClick={() => void toggleLock()}><span>{data.locked ? "Buka kunci bulan" : "Kunci bulan"}</span><em>{data.locked ? "Terkunci" : "Terbuka"}</em></button>
        <a className="li" href={`/api/export?m=${month}`}><span>Ekspor CSV</span><em>Unduh</em></a>
        <button type="button" className="li" onClick={() => fileRef.current?.click()}><span>Impor dari Excel</span><em>.xlsx</em></button>
        <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={(e) => void pickFile(e.target.files?.[0])} />
      </div>
      <p className="note">Modal hanya berlaku untuk {BLN[mo - 1]} {y}. Bulan lain tidak ikut berubah, dan bulan baru otomatis memakai modal bulan sebelumnya.</p>
      {imp && (
        <div className="card">
          <h2>Pratinjau impor</h2>
          <p className="note">Ditemukan {imp.found} hari terisi. Akan diimpor {imp.importable} hari, {imp.overwrite} di antaranya menimpa data yang sudah ada.{imp.skipped > 0 && ` ${imp.skipped} hari dilewati karena bulannya terkunci.`} {imp.modalNote}</p>
          <button type="button" className="primary" disabled={imp.importable === 0} onClick={() => void runImport()}>Impor sekarang</button>
          <button type="button" className="ghost" onClick={() => setImp(null)}>Batal</button>
        </div>
      )}
      {impMsg && <p className="note" role="status">{impMsg}</p>}
      <p className="grp">Akun</p>
      <div className="lc"><button type="button" className="li danger" onClick={() => void logout()}>Keluar</button></div>
    </>
  );

  return (
    <div className={`app${tab === "detail" ? " wide" : ""}`}>
    <main className="main">
      <header className="hdr">
        <h1>{TITLES[tab]}</h1>
        {!(tab === "ringkasan" && rmode !== "bulan") && (
          <div className="msw">
            <button type="button" aria-label="Bulan sebelumnya" onClick={() => setMonth(shift(month, -1))}><ChevronLeft size={18} /></button>
            <span>{BLN[mo - 1]} {y}</span>
            <button type="button" aria-label="Bulan berikutnya" onClick={() => setMonth(shift(month, 1))}><ChevronRight size={18} /></button>
          </div>
        )}
      </header>
      {err && <div id="warn" role="alert">{err}</div>}
      <div className={`pg pg-${tab}`}>{{ beranda, kalender, detail, ringkasan, pengaturan }[tab]}</div>
    </main>

      <button type="button" className="fab" aria-label="Isi rekap" onClick={() => openSheet(fabKey)}><Plus size={26} /></button>
      <nav className="nav" aria-label="Menu utama">
        <p className="brand"><span className="logo"><Wallet size={20} /></span><span>Rekap Kas<small>Harian</small></span></p>
        <div className="nav-items">
          {NAV.map(([id, label, Icon]) => (
            <button type="button" key={id} aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)}><Icon size={22} />{label}</button>
          ))}
        </div>
        <button type="button" className="side-add" onClick={() => openSheet(fabKey)}><Plus size={18} />Isi Rekap</button>
      </nav>

      <dialog ref={dlg} aria-labelledby="dt">
        <form onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <div className="sh2">
            <h2 id="dt">Catat Rekap {data.locked && <span className="chip warn">Terkunci</span>}</h2>
            <button type="button" className="x" aria-label="Tutup" onClick={() => dlg.current?.close()}><X size={18} /></button>
          </div>
          <div className="bd">
            <label>Tanggal
              <input type="date" value={cur} min={keys[0]} max={keys[keys.length - 1]} onChange={(e) => e.target.value && loadDraft(e.target.value)} />
            </label>
            <div className="seg" role="tablist" style={{ marginBottom: 14 }}>
              {["Pemasukan", "Pengeluaran", "Kas"].map((l, i) => <button type="button" key={l} aria-pressed={sec === i} onClick={() => setSec(i)}>{l}</button>)}
            </div>
            <fieldset className="fs" disabled={data.locked}>
              {sec === 0 && FIELDS.map(([k, l]) => (
                <label key={k}>{l}<input type="number" inputMode="numeric" placeholder="Rp 0" value={draft[k] ?? ""} onChange={(e) => set(k, num(e.target.value))} /></label>
              ))}
              {sec === 1 && (
                <>
                  <datalist id="ket">{[...new Set(Object.values(data.days).flatMap((d) => d.items.map((i) => i.n)).filter(Boolean))].map((n) => <option key={n} value={n} />)}</datalist>
                  {draft.items.map((it, i) => (
                    <div className="ex" key={i}>
                      <input list="ket" autoComplete="off" aria-label={`Keterangan pengeluaran ${i + 1}`} placeholder="Keterangan, misal Bensin" autoFocus={focusIdx === i}
                        value={it.n} onChange={(e) => setItem(i, { n: e.target.value })} onKeyDown={(e) => e.key === "Enter" && e.preventDefault()} />
                      <input type="number" inputMode="numeric" aria-label={`Nominal pengeluaran ${i + 1}`} placeholder="Rp 0" value={it.v ?? ""}
                        onChange={(e) => setItem(i, { v: num(e.target.value) })} onKeyDown={(e) => e.key === "Enter" && e.preventDefault()} />
                      <button type="button" className="rm" aria-label={`Hapus baris ${i + 1}`} onClick={() => removeItem(i)}><Trash2 size={17} /></button>
                    </div>
                  ))}
                  <button type="button" className="add" disabled={draft.items.length >= MAX_ITEMS} onClick={addItem}><Plus size={18} />Tambah pengeluaran</button>
                </>
              )}
              {sec === 2 && (
                <>
                  <label>Talangan / tambahan kas<input type="number" inputMode="numeric" placeholder="Rp 0" value={draft.tal ?? ""} onChange={(e) => set("tal", num(e.target.value))} /></label>
                  <label>Sumber talangan<select value={draft.sumber} onChange={(e) => set("sumber", e.target.value)}>{SRC.map((s) => <option key={s}>{s}</option>)}</select></label>
                  <label>Saldo cash menurut laporan<input type="number" inputMode="numeric" placeholder="Rp 0" value={draft.lapS ?? ""} onChange={(e) => set("lapS", num(e.target.value))} /></label>
                </>
              )}
            </fieldset>
            <div className="live" aria-live="polite">
              <div><span>Total pemasukan</span><b>{rp(live.masuk)}</b></div>
              <div><span>Selisih dengan laporan</span><b>{selisih(live.selM)}</b></div>
              <div><span>Total pengeluaran</span><b>{rp(live.keluar)}</b></div>
              <div><span>Saldo cash</span><b>{rp(live.saldo)}</b></div>
              <div><span>Selisih saldo dengan laporan</span><b>{selisih(live.selS)}</b></div>
              <div className="big2"><span>Uang di laci akhir hari</span><b className={(live.laci ?? 0) < 0 ? "neg" : ""}>{rp(live.laci)}</b></div>
            </div>
            {derr && <p id="warn" role="alert" style={{ marginTop: 12 }}>{derr}</p>}
          </div>
          <div className="ft">
            {data.locked ? (
              <button type="button" className="primary" onClick={() => dlg.current?.close()}>Tutup</button>
            ) : (
              <>
                <button type="submit" className="primary">Simpan Rekap</button>
                {data.days[cur] && <button type="button" className="ghost" onClick={() => void clear()}>{sure ? "Yakin? Tekan lagi untuk menghapus" : "Kosongkan hari ini"}</button>}
              </>
            )}
          </div>
        </form>
      </dialog>
    </div>
  );
}
