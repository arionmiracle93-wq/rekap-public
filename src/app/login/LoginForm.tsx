"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Loader2, Lock, User, Wallet } from "lucide-react";

const NAMA_KEY = "rk_nama";

export function LoginForm() {
  const params = useSearchParams();
  const [name, setName] = useState(() => {
    try {
      return window.localStorage.getItem(NAMA_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    if (pending || !password || !name.trim()) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, name: name.trim() }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error || "Gagal masuk.");
        setPending(false);
        return;
      }
      try {
        window.localStorage.setItem(NAMA_KEY, name.trim());
      } catch {
        /* localStorage penuh/blokir — bukan halangan login */
      }
      const next = params.get("next");
      // Hanya izinkan alamat di dalam aplikasi ini.
      window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    } catch {
      setError("Koneksi bermasalah. Coba lagi.");
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="w-full max-w-sm"
    >
      <div className="mb-6 text-center">
        <span
          className="mx-auto grid h-16 w-16 place-items-center rounded-3xl text-white shadow-[0_12px_28px_rgba(91,69,240,0.35)]"
          style={{ background: "linear-gradient(135deg,#5b45f0,#8a3ffc)" }}
        >
          <Wallet size={30} />
        </span>
        <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-slate-900">Rekap Kas Harian</h1>
        <p className="mt-1 text-sm text-slate-500">Masukkan nama & kata sandi untuk membuka rekap kas.</p>
      </div>

      <div className="lg-card lg-card-p space-y-4">
        <label className="block">
          <span className="lg-label">Nama kamu</span>
          <div className="relative">
            <User size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              className="input !pl-10"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              autoComplete="name"
              placeholder="mis. Dewi"
            />
          </div>
          <span className="mt-1 block text-[11px] text-slate-400">
            Tercatat sebagai pengubah data. Diingat di perangkat ini.
          </span>
        </label>

        <label className="block">
          <span className="lg-label">Kata sandi</span>
          <div className="relative">
            <Lock size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="password"
              className="input !pl-10"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </div>
        </label>

        {error ? (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm font-semibold text-rose-700">{error}</p>
        ) : null}

        <button type="submit" className="lg-btn lg-btn-primary w-full" disabled={pending || !password || !name.trim()}>
          {pending ? <Loader2 size={16} className="animate-spin" /> : null}
          Masuk
        </button>
      </div>
    </form>
  );
}
