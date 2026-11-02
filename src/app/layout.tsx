import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Rekap Kas Harian", template: "%s · Rekap Kas Harian" },
  description: "Rekap kas harian pengganti template Excel: pemasukan, pengeluaran, talangan, dan selisih otomatis.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0d1626" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try{document.documentElement.dataset.theme=localStorage.getItem("rk_tema")==="light"?"light":"dark"}catch(e){}` }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
