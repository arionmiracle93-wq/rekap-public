import { SESSION_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
    },
  });
}
