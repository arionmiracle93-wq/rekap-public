import { actorFromCookieHeader } from "@/lib/auth";
import { cleanDay, hasContent } from "@/lib/calc";
import { deleteDay, isLocked, saveDay } from "@/lib/queries";

export const dynamic = "force-dynamic";

const validDate = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const LOCKED = "Bulan ini sudah dikunci. Buka kunci dulu kalau mau mengubah.";
const bad = (error: string, status = 400) => Response.json({ ok: false, error }, { status });

/** Simpan satu hari. Hari yang dikosongkan seluruhnya otomatis dihapus. */
export async function PUT(request: Request) {
  let body: { date?: unknown; day?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return bad("Data tidak terbaca.");
  }
  if (!validDate(body.date)) return bad("Tanggal tidak valid.");
  const day = cleanDay(body.day);
  try {
    if (await isLocked(body.date.slice(0, 7))) return bad(LOCKED, 423);
    if (hasContent(day)) await saveDay(body.date, day, actorFromCookieHeader(request.headers.get("cookie")));
    else await deleteDay(body.date);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("PUT /api/day", error);
    return bad("Gagal menyimpan.", 500);
  }
}

export async function DELETE(request: Request) {
  const date = new URL(request.url).searchParams.get("date");
  if (!validDate(date)) return bad("Tanggal tidak valid.");
  try {
    if (await isLocked(date.slice(0, 7))) return bad(LOCKED, 423);
    await deleteDay(date);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/day", error);
    return bad("Gagal menghapus.", 500);
  }
}
