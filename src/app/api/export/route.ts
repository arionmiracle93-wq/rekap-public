import { rangeOk, validDate } from "@/lib/calc";
import { buildCsv } from "@/lib/csv";
import { getMonth, getRange } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** CSV satu bulan (?m=2026-11) atau rentang bebas (?from=...&to=...). */
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const m = sp.get("m") ?? "", from = sp.get("from"), to = sp.get("to");
  try {
    let name: string, modal: number | Record<string, number>, days: Parameters<typeof buildCsv>[1];
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) {
      name = m;
      ({ modal, days } = await getMonth(m));
    } else if (validDate(from) && validDate(to) && rangeOk(from, to)) {
      name = `${from}_sd_${to}`;
      ({ modals: modal, days } = await getRange(from, to));
    } else {
      return Response.json({ ok: false, error: "Bulan atau rentang tanggal tidak valid." }, { status: 400 });
    }
    return new Response(buildCsv(modal, days), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="rekap-kas-${name}.csv"` },
    });
  } catch (error) {
    console.error("GET /api/export", error);
    return Response.json({ ok: false, error: "Gagal membuat file ekspor." }, { status: 500 });
  }
}
