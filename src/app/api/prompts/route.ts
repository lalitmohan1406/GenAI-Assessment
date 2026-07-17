import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import path from "path";

/**
 * GET /api/prompts — returns the raw prompt template so the in-app /prompts
 * page can display it during the "show your prompts" part of the demo. Reading
 * from /prompts proves the prompt is externalised from code, not hardcoded.
 */
export async function GET() {
  try {
    const file = path.join(process.cwd(), "prompts", "invoice-triage.md");
    const content = readFileSync(file, "utf8");
    return NextResponse.json({ name: "invoice-triage.md", content });
  } catch {
    return NextResponse.json({ error: "Prompt file not found." }, { status: 404 });
  }
}
