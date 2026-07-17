import { NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/auth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  // Clear the session cookie by expiring it immediately.
  res.cookies.set({ name: COOKIE_NAME, value: "", path: "/", maxAge: 0 });
  return res;
}
