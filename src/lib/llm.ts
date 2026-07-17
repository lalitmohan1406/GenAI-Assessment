import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { buildTriagePrompt } from "./prompt";
import { isLlmDisabled } from "./llm-mode";
import {
  deriveFallbackDecision,
  type Decision,
  type ExceptionFlag,
  type PoRecord,
} from "./matching";

/**
 * Stage two of triage: the LLM. It receives the invoice facts + the exception
 * flags from the deterministic engine and returns a business-language
 * recommendation. Everything is wrapped so that ANY failure (no API key,
 * timeout, rate limit, malformed output) degrades gracefully to the
 * rules-based fallback — the caller and UI can always render a result.
 */

const REQUEST_TIMEOUT_MS = 20_000;

export interface TriageArgs {
  invoiceNumber: string;
  vendorName: string;
  poNumber?: string | null;
  amount: number;
  matchedPo: PoRecord | null;
  flags: ExceptionFlag[];
}

export interface TriageResult {
  recommendation: Decision;
  rationale: string;
  confidence: number;
  source: "llm" | "fallback"; // did the real model answer, or did we fall back?
  model: string | null;
  raw: string | null; // raw model text, retained for the eval log / debugging
  fallbackReason?: string; // why we fell back (shown discreetly in the UI)
}

// The exact shape we require back from the model. Anything else is rejected and
// triggers the fallback — we never store unvalidated model output.
const llmSchema = z.object({
  recommendation: z.enum(["approve", "escalate", "reject"]),
  rationale: z.string().min(1).max(600),
  confidence: z.number().min(0).max(1),
});

function fallback(args: TriageArgs, reason: string): TriageResult {
  const { recommendation, rationale } = deriveFallbackDecision(args.flags);
  return {
    recommendation,
    rationale,
    confidence: 0.5,
    source: "fallback",
    model: null,
    raw: null,
    fallbackReason: reason,
  };
}

/** Pull the first JSON object out of the model text, tolerating code fences. */
function extractJson(text: string): unknown {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("no JSON object found");
  return JSON.parse(cleaned.slice(start, end + 1));
}

export async function triageInvoice(args: TriageArgs): Promise<TriageResult> {
  // Demo switch: force the deterministic path even when a key is present.
  if (isLlmDisabled()) {
    return fallback(args, "LLM disabled from the demo toggle — using rules-based fallback.");
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";

  // No key configured → deterministic fallback (a supported mode, not an error).
  if (!apiKey) return fallback(args, "No ANTHROPIC_API_KEY configured — using rules-based fallback.");

  const { system, user } = buildTriagePrompt(args);
  const client = new Anthropic({ apiKey, maxRetries: 1 });

  try {
    const response = await client.messages.create(
      {
        model,
        max_tokens: 400,
        system,
        messages: [{ role: "user", content: user }],
      },
      { timeout: REQUEST_TIMEOUT_MS },
    );

    const raw = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    const parsed = llmSchema.parse(extractJson(raw));

    return {
      recommendation: parsed.recommendation,
      rationale: parsed.rationale,
      confidence: parsed.confidence,
      source: "llm",
      model,
      raw,
    };
  } catch (err) {
    // Timeout, rate limit (429), network, or schema-validation failure all land
    // here. We log server-side and return the safe fallback for the UI.
    const reason =
      err instanceof Anthropic.APIError
        ? `Claude API error (${err.status ?? "network"}) — showing rules-based fallback.`
        : "Could not parse a valid AI response — showing rules-based fallback.";
    console.error("[triageInvoice] falling back:", err);
    return fallback(args, reason);
  }
}
