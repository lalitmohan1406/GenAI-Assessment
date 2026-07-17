import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSessionToken, sessionCookieOptions } from "@/lib/auth";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  // Same generic error whether the email or password is wrong (avoid user enumeration).
  const ok = user && (await bcrypt.compare(parsed.data.password, user.password));
  if (!user || !ok) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  const token = await createSessionToken({ id: user.id, email: user.email, role: user.role });
  const res = NextResponse.json({ user: { id: user.id, email: user.email, role: user.role } });
  res.cookies.set({ ...sessionCookieOptions(), value: token });
  return res;
}
