import { num } from "@/lib/calc";
import { isLocked, setModal } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** Ubah modal kasir untuk SATU bulan: { month: "2026-11", modal: 200000 }. Bulan terkunci tidak bisa diubah. */
export async function PUT(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { modal?: unknown; month?: unknown };
  const modal = num(body.modal);
  if (modal == null || modal < 0) return Response.json({ ok: false, error: "Modal harus angka 0 atau lebih." }, { status: 400 });
  if (typeof body.month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(body.month)) {
    return Response.json({ ok: false, error: "Bulan tidak valid." }, { status: 400 });
  }
  try {
    if (await isLocked(body.month)) {
      return Response.json({ ok: false, error: "Bulan ini sudah dikunci. Buka kunci dulu kalau mau mengubah modal." }, { status: 423 });
    }
    await setModal(body.month, modal);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("PUT /api/settings", error);
    return Response.json({ ok: false, error: "Gagal menyimpan modal." }, { status: 500 });
  }
}
