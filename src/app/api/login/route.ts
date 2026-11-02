import { SESSION_COOKIE, SESSION_DAYS, checkPassword, createSessionToken, sanitizeName, passwordConfigured } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!passwordConfigured()) {
    return Response.json(
      { ok: false, error: "APP_PASSWORD belum diisi di pengaturan server (minimal 4 karakter)." },
      { status: 503 },
    );
  }

  let password = "";
  let nameRaw = "";
  try {
    const body = (await request.json()) as { password?: unknown; name?: unknown };
    password = typeof body.password === "string" ? body.password : "";
    nameRaw = typeof body.name === "string" ? body.name : "";
  } catch {
    return Response.json({ ok: false, error: "Data tidak terbaca." }, { status: 400 });
  }

  const name = sanitizeName(nameRaw);
  if (!name) {
    return Response.json(
      { ok: false, error: "Nama wajib diisi (1–40 huruf). Nama ini tercatat sebagai pengubah data." },
      { status: 400 },
    );
  }

  if (!checkPassword(password)) {
    await new Promise((r) => setTimeout(r, 900)); // perlambat tebak-tebakan
    return Response.json({ ok: false, error: "Kata sandi salah." }, { status: 401 });
  }

  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const cookie = `${SESSION_COOKIE}=${createSessionToken(name)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`;
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json", "Set-Cookie": cookie },
  });
}
