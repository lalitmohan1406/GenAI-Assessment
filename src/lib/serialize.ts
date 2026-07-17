import type { Invoice } from "@prisma/client";
import type { ExceptionFlag } from "./matching";

/**
 * Turn a stored Invoice row into the shape the frontend consumes: exception
 * flags are parsed from their JSON string back into objects here so the UI
 * never has to parse JSON itself.
 */
export function serializeInvoice(inv: Invoice) {
  let flags: ExceptionFlag[] = [];
  try {
    flags = JSON.parse(inv.exceptionFlags) as ExceptionFlag[];
  } catch {
    flags = [];
  }
  return {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    vendorName: inv.vendorName,
    poNumber: inv.poNumber,
    amount: inv.amount,
    status: inv.status,
    hasException: inv.hasException,
    flags,
    ai: {
      recommendation: inv.aiRecommendation,
      rationale: inv.aiRationale,
      confidence: inv.aiConfidence,
      model: inv.aiModel,
      source: inv.aiSource, // "llm" | "fallback"
    },
    humanOverride: inv.humanOverride,
    overrideNote: inv.overrideNote,
    resolvedAt: inv.resolvedAt,
    source: inv.source,
    createdAt: inv.createdAt,
  };
}
