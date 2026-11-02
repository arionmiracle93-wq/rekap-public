import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

/** Gerbang login: semua halaman & API butuh sesi, kecuali /login dan /api/login. */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Halaman login & cek kesehatan server harus bisa diakses tanpa sesi.
  if (pathname === "/login" || pathname === "/api/login" || pathname === "/api/health") return NextResponse.next();

  if (verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return Response.json({ ok: false, error: "Belum login." }, { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|webmanifest)$).*)"],
};
