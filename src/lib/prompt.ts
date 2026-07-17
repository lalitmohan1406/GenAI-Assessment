import { readFileSync } from "fs";
import path from "path";
import type { ExceptionFlag, PoRecord } from "./matching";

/**
 * Loads and fills the externalised prompt template in /prompts. Splitting the
 * prompt into a file (rather than a string literal in the route handler) is a
 * deliberate discipline from the assessment: prompts can be versioned and
 * iterated by a non-developer, and reviewed in the "show your prompts" demo.
 */

const PROMPT_PATH = path.join(process.cwd(), "prompts", "invoice-triage.md");

export interface PromptInputs {
  invoiceNumber: string;
  vendorName: string;
  poNumber?: string | null;
  amount: number;
  matchedPo: PoRecord | null;
  flags: ExceptionFlag[];
}

/** Read the template once per call (cheap, and picks up edits without restart). */
function loadTemplate(): { system: string; user: string } {
  const raw = readFileSync(PROMPT_PATH, "utf8");
  // The template body lives after the `---` separator; sections are marked by
  // `## SYSTEM` and `## USER` headings.
  const body = raw.split(/^---\s*$/m).slice(1).join("---");
  const sysMatch = body.split(/^##\s+SYSTEM\s*$/m)[1] ?? "";
  const [system, userPart] = sysMatch.split(/^##\s+USER\s*$/m);
  return { system: system.trim(), user: (userPart ?? "").trim() };
}

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

export function buildTriagePrompt(inputs: PromptInputs): { system: string; user: string } {
  const template = loadTemplate();

  const poContext = inputs.matchedPo
    ? `- PO number: ${inputs.matchedPo.poNumber}\n` +
      `- PO vendor: ${inputs.matchedPo.vendorName}\n` +
      `- Approved amount: ${money(inputs.matchedPo.approvedAmount)}\n` +
      `- PO status: ${inputs.matchedPo.status}`
    : "(No matching purchase order was found in the register.)";

  const flagText =
    inputs.flags.length === 0
      ? "(none — the invoice matched cleanly)"
      : inputs.flags
          .map((f) => `- [${f.severity.toUpperCase()}] ${f.code}: ${f.message}`)
          .join("\n");

  const user = template.user
    .replaceAll("{{INVOICE_NUMBER}}", inputs.invoiceNumber)
    .replaceAll("{{VENDOR_NAME}}", inputs.vendorName)
    .replaceAll("{{PO_NUMBER}}", inputs.poNumber?.trim() || "(none provided)")
    .replaceAll("{{AMOUNT}}", money(inputs.amount))
    .replaceAll("{{PO_CONTEXT}}", poContext)
    .replaceAll("{{EXCEPTION_FLAGS}}", flagText);

  return { system: template.system, user };
}
