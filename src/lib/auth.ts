import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

/**
 * Minimal session auth (the assessment explicitly scopes out SSO/OAuth).
 * A signed JWT is stored in an httpOnly cookie so it cannot be read by JS.
 * `jose` is used (not `jsonwebtoken`) because it runs in the Edge runtime,
 * which lets `middleware.ts` verify the token without a Node runtime.
 */

export const COOKIE_NAME = "fos_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

export interface SessionUser {
  id: number;
  email: string;
  role: string;
}

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({ email: user.email, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secretKey());
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return {
      id: Number(payload.sub),
      email: String(payload.email),
      role: String(payload.role),
    };
  } catch {
    return null;
  }
}

/** Set the session cookie (called from the login route). */
export function sessionCookieOptions() {
  return {
    name: COOKIE_NAME,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  };
}

/** Read the current user from the request cookies (server-side only). */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}
