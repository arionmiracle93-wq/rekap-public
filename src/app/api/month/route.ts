import { getMonth } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const m = new URL(request.url).searchParams.get("m") ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) return Response.json({ ok: false, error: "Bulan tidak valid." }, { status: 400 });
  try {
    return Response.json({ ok: true, ...(await getMonth(m)) });
  } catch (error) {
    console.error("GET /api/month", error);
    return Response.json({ ok: false, error: "Gagal membaca data. Sudah membuka /api/setup sekali?" }, { status: 500 });
  }
}
