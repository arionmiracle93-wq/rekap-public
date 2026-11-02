import { actorFromCookieHeader } from "@/lib/auth";
import { parseTemplate } from "@/lib/importXlsx";
import { existingDates, getModal, isLocked, saveDay } from "@/lib/queries";

export const dynamic = "force-dynamic";

const bad = (error: string, status = 400) => Response.json({ ok: false, error }, { status });

/** Impor dari template Excel. ?dry=1 = pratinjau saja (tidak menyimpan). Hari yang sama ditimpa; bulan terkunci dilewati. */
export async function POST(request: Request) {
  const dry = new URL(request.url).searchParams.get("dry") === "1";
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return bad("File belum dipilih.");
  if (file.size > 2_000_000) return bad("File terlalu besar (maks. 2 MB).");

  try {
    const { days, fileModal } = await parseTemplate(await file.arrayBuffer());
    const keys = Object.keys(days).sort();
    if (!keys.length) return bad("Tidak ada hari terisi yang terbaca. Pastikan memakai template Rekap Kas.");

    const locked = new Set<string>();
    for (const m of new Set(keys.map((k) => k.slice(0, 7)))) if (await isLocked(m)) locked.add(m);
    const importable = keys.filter((k) => !locked.has(k.slice(0, 7)));
    const existing = await existingDates(keys[0], keys[keys.length - 1]);
    const firstMonth = (importable[0] ?? keys[0]).slice(0, 7);
    const out = {
      ok: true, found: keys.length, importable: importable.length, skipped: keys.length - importable.length,
      overwrite: importable.filter((k) => existing.has(k)).length,
      firstMonth, fileModal, modal: await getModal(firstMonth),
    };
    if (dry) return Response.json(out);

    const actor = actorFromCookieHeader(request.headers.get("cookie"));
    for (const k of importable) await saveDay(k, days[k], actor);
    return Response.json({ ...out, imported: importable.length });
  } catch (error) {
    console.error("POST /api/import", error);
    return bad(error instanceof Error && /xlsx|Sheet/.test(error.message) ? error.message : "Gagal membaca file.", 500);
  }
}
