import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`SELECT 1`);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false, error: "Database belum terhubung. Cek DATABASE_URL." }, { status: 503 });
  }
}
