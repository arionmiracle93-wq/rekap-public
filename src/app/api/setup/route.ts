import { sql } from "drizzle-orm";
import { db } from "@/db";
import { DDL } from "@/lib/ddl";

export const dynamic = "force-dynamic";

/** Tombol pembuat tabel: buka /api/setup sekali setelah deploy. Aman diulang. */
export async function GET(request: Request) {
  const token = process.env.SETUP_TOKEN;
  if (token && new URL(request.url).searchParams.get("token") !== token) {
    return Response.json({ ok: false, error: "Token setup salah. Tambahkan ?token=..." }, { status: 401 });
  }
  try {
    for (const statement of DDL) await db.execute(sql.raw(statement));
    return Response.json({ ok: true, message: "Database siap dipakai.", tables: ["daily_recaps", "month_locks", "settings"] });
  } catch (error) {
    console.error("GET /api/setup", error);
    return Response.json({ ok: false, error: "Gagal menyiapkan database.", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export const POST = GET;
