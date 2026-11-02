import { rangeOk, validDate } from "@/lib/calc";
import { getRange } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** Data semua hari terisi dalam rentang: ?from=2026-01-01&to=2026-12-31 (maks. ~2 tahun). */
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const from = sp.get("from"), to = sp.get("to");
  if (!validDate(from) || !validDate(to) || !rangeOk(from, to)) {
    return Response.json({ ok: false, error: "Rentang tanggal tidak valid (maksimal sekitar 2 tahun)." }, { status: 400 });
  }
  try {
    return Response.json({ ok: true, ...(await getRange(from, to)) });
  } catch (error) {
    console.error("GET /api/range", error);
    return Response.json({ ok: false, error: "Gagal membaca data." }, { status: 500 });
  }
}
