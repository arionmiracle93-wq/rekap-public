import { actorFromCookieHeader } from "@/lib/auth";
import { setLock } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** Kunci / buka kunci satu bulan: { month: "2026-11", locked: true }. */
export async function PUT(request: Request) {
  const b = (await request.json().catch(() => ({}))) as { month?: unknown; locked?: unknown };
  if (typeof b.month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(b.month) || typeof b.locked !== "boolean") {
    return Response.json({ ok: false, error: "Data tidak valid." }, { status: 400 });
  }
  try {
    await setLock(b.month, b.locked, actorFromCookieHeader(request.headers.get("cookie")));
    return Response.json({ ok: true });
  } catch (error) {
    console.error("PUT /api/lock", error);
    return Response.json({ ok: false, error: "Gagal mengubah kunci bulan." }, { status: 500 });
  }
}
