import { prisma } from "./prisma";
import { computeExceptions, type PoRecord } from "./matching";
import { triageInvoice } from "./llm";
import { writeAudit } from "./audit";

/**
 * Orchestrates a full triage for one invoice and persists the result:
 *   1. load matching context (PO register, approved vendors, prior invoices),
 *   2. run the deterministic exception engine,
 *   3. ask the LLM for a recommendation (with graceful fallback),
 *   4. persist the flags + AI output on the invoice,
 *   5. write an audit record.
 *
 * Reused by invoice creation and the manual "re-run AI" action so the logic
 * lives in exactly one place.
 */
export async function runTriage(invoiceId: number, userId?: number | null) {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw new Error(`Invoice ${invoiceId} not found`);

  const [pos, vendors, others] = await Promise.all([
    prisma.purchaseOrder.findMany(),
    prisma.vendor.findMany(),
    // Duplicate detection is directional: an invoice can only duplicate one that
    // arrived EARLIER. We therefore compare against invoices with a lower id
    // (insertion order). This mirrors real intake — the first submission is
    // clean; the later identical one is the duplicate — and prevents the two
    // members of a duplicate pair from flagging each other.
    prisma.invoice.findMany({ where: { id: { lt: invoiceId } } }),
  ]);

  const poRecords: PoRecord[] = pos.map((p) => ({
    poNumber: p.poNumber,
    vendorName: p.vendorName,
    approvedAmount: p.approvedAmount,
    status: p.status,
  }));

  const { flags, matchedPo, hasException } = computeExceptions(
    {
      invoiceNumber: invoice.invoiceNumber,
      vendorName: invoice.vendorName,
      poNumber: invoice.poNumber,
      amount: invoice.amount,
    },
    {
      purchaseOrders: poRecords,
      approvedVendors: vendors.map((v) => v.name),
      priorInvoices: others.map((o) => ({
        invoiceNumber: o.invoiceNumber,
        vendorName: o.vendorName,
        poNumber: o.poNumber,
        amount: o.amount,
      })),
    },
  );

  const ai = await triageInvoice({
    invoiceNumber: invoice.invoiceNumber,
    vendorName: invoice.vendorName,
    poNumber: invoice.poNumber,
    amount: invoice.amount,
    matchedPo,
    flags,
  });

  const updated = await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      hasException,
      exceptionFlags: JSON.stringify(flags),
      aiRecommendation: ai.recommendation,
      aiRationale: ai.rationale,
      aiConfidence: ai.confidence,
      aiModel: ai.model,
      aiSource: ai.source,
      aiRaw: ai.raw,
    },
  });

  await writeAudit({
    userId,
    entityType: "invoice",
    entityId: invoiceId,
    action: "ai_triage",
    newValue: {
      recommendation: ai.recommendation,
      confidence: ai.confidence,
      source: ai.source,
      flags: flags.map((f) => f.code),
    },
  });

  return { invoice: updated, flags, matchedPo, ai };
}
