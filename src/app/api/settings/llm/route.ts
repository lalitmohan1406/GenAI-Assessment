import { NextResponse } from "next/server";
import { z } from "zod";
import { isLlmDisabled, setLlmDisabled } from "@/lib/llm-mode";

/**
 * Demo toggle for the AI model. GET reports whether the LLM is currently
 * disabled; POST { llmDisabled: boolean } flips it. When disabled, every triage
 * takes the rules-based fallback path (see lib/llm.ts). Guarded by the auth
 * middleware like the rest of /api.
 */
export async function GET() {
  return NextResponse.json({ llmDisabled: isLlmDisabled() });
}

const bodySchema = z.object({ llmDisabled: z.boolean() });

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Expected { llmDisabled: boolean }" }, { status: 400 });
  }
  setLlmDisabled(parsed.data.llmDisabled);
  return NextResponse.json({ llmDisabled: isLlmDisabled() });
}
