"use client";

import dynamic from "next/dynamic";

// Tanpa SSR: tanggal, tema, dan bulan dibaca dari perangkat pengguna (bukan server).
const RekapApp = dynamic(() => import("@/components/RekapApp").then((m) => m.RekapApp), { ssr: false });

export function RekapShell() {
  return <RekapApp />;
}
