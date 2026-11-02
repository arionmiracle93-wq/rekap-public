import { createHash, createHmac, timingSafeEqual } from "crypto";

/**
 * Login = satu kata sandi (APP_PASSWORD) + nama kasir (tercatat sebagai pengubah data).
 * Sesi = cookie bertanda tangan HMAC berisi waktu tenggat (+ nama, opsional).
 * Format token:
 * - lama : "<expires>.<hmac>"                     (tanpa nama — tetap valid)
 * - baru : "<expires>|<nama-ter-encoded>.<hmac>"  (nama ikut wajib di audit)
 * Ganti APP_PASSWORD -> semua sesi lama otomatis hangus.
 */

export const SESSION_COOKIE = "rk_session";
export const SESSION_DAYS = 30;
/** Batas panjang nama kasir di sesi & audit. */
export const MAX_NAME = 40;

export function passwordConfigured(): boolean {
  return Boolean(process.env.APP_PASSWORD && process.env.APP_PASSWORD.length >= 4);
}

function key(): string {
  return `${process.env.APP_PASSWORD ?? ""}::${process.env.SESSION_SECRET ?? ""}`;
}

function sign(payload: string): string {
  return createHmac("sha256", key()).update(payload).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function checkPassword(input: string): boolean {
  if (!passwordConfigured()) return false;
  return safeEqual(input, process.env.APP_PASSWORD as string);
}

/** Rapikan nama kasir: buang karakter kendali, rapikan spasi, batasi panjang. */
export function sanitizeName(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f\u007f<>;,]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME);
}

function payloadOf(expires: string, name: string): string {
  return name ? `${expires}|${encodeURIComponent(name)}` : expires;
}

export function createSessionToken(name?: string | null): string {
  const expires = String(Date.now() + SESSION_DAYS * 86_400_000);
  const payload = payloadOf(expires, sanitizeName(name ?? ""));
  return `${payload}.${sign(payload)}`;
}

/** Pecah token jadi { payload, mac } dengan mac di titik TERAKHIR (nama tidak boleh isi "."). */
function splitToken(token: string): { payload: string; mac: string } | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  if (!payload || !mac || !/^[0-9a-f]{64}$/.test(mac)) return null;
  if (!/^\d+(\|.*)?$/.test(payload)) return null;
  return { payload, mac };
}

function isValid(token: string | undefined | null): boolean {
  if (!token || !passwordConfigured()) return false;
  const parts = splitToken(token);
  if (!parts) return false;
  const expires = parts.payload.split("|")[0];
  if (Number(expires) < Date.now()) return false;
  return safeEqual(parts.mac, sign(parts.payload));
}

export function verifySessionToken(token: string | undefined | null): boolean {
  return isValid(token);
}

/** Nama kasir dari token sesi; null kalau sesi lama (tanpa nama) atau tidak sah. */
export function readSessionName(token: string | undefined | null): string | null {
  if (!isValid(token)) return null;
  const parts = splitToken(token as string) as { payload: string; mac: string };
  const idx = parts.payload.indexOf("|");
  if (idx < 0) return null;
  const encoded = parts.payload.slice(idx + 1);
  try {
    return sanitizeName(decodeURIComponent(encoded)) || null;
  } catch {
    return null;
  }
}

/** Ambil nama kasir dari kepala Cookie sebuah Request (dipakai API routes). */
export function actorFromCookieHeader(header: string | null | undefined): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(`${SESSION_COOKIE}=`)) continue;
    const value = trimmed.slice(SESSION_COOKIE.length + 1);
    return readSessionName(value);
  }
  return null;
}
