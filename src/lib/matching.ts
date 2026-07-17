/**
 * Deterministic invoice-vs-PO matching engine.
 *
 * This is the FIRST of the two triage stages. It contains NO AI. It compares an
 * invoice against the PO register + approved-vendor list + prior invoices, and
 * emits a set of structured "exception flags". These flags are the ground-truth
 * facts that the LLM (stage two) later reasons over and explains in plain English.
 *
 * Keeping this logic deterministic and separate from the LLM matters:
 *   - the facts are auditable and never hallucinated;
 *   - the LLM's job is judgement + communication, not arithmetic;
 *   - if the LLM is unavailable we can still derive a safe recommendation here
 *     (see deriveFallbackDecision).
 */

export type ExceptionCode =
  | "MISSING_PO"
  | "PO_NOT_FOUND"
  | "UNKNOWN_VENDOR"
  | "PO_CLOSED"
  | "VENDOR_MISMATCH"
  | "OVER_PO"
  | "UNDER_PO"
  | "DUPLICATE";

export type Severity = "high" | "medium" | "low";

export interface ExceptionFlag {
  code: ExceptionCode;
  severity: Severity;
  message: string; // business-language, safe to show a Finance user
}

export type Decision = "approve" | "escalate" | "reject";

/** The invoice fields we need to run matching. */
export interface InvoiceInput {
  invoiceNumber: string;
  vendorName: string;
  poNumber?: string | null;
  amount: number;
}

/** A PO register row (subset of the PurchaseOrder table). */
export interface PoRecord {
  poNumber: string;
  vendorName: string;
  approvedAmount: number;
  status: string; // "Open" | "Closed"
}

/** A prior invoice, used for duplicate detection. */
export interface PriorInvoice {
  invoiceNumber: string;
  vendorName: string;
  poNumber?: string | null;
  amount: number;
}

export interface MatchContext {
  purchaseOrders: PoRecord[];
  approvedVendors: string[]; // names of vendors we already work with
  priorInvoices: PriorInvoice[];
}

export interface MatchResult {
  hasException: boolean;
  flags: ExceptionFlag[];
  matchedPo: PoRecord | null;
}

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Run every discrepancy check and collect the flags that fire.
 * Pure function — no DB, no network — so it is trivially testable.
 */
export function computeExceptions(invoice: InvoiceInput, ctx: MatchContext): MatchResult {
  const flags: ExceptionFlag[] = [];

  const hasPo = !!invoice.poNumber && invoice.poNumber.trim().length > 0;
  const matchedPo = hasPo
    ? ctx.purchaseOrders.find((po) => norm(po.poNumber) === norm(invoice.poNumber!)) ?? null
    : null;

  // 1. Missing PO reference on the invoice.
  if (!hasPo) {
    flags.push({
      code: "MISSING_PO",
      severity: "high",
      message: "No purchase order reference was provided on the invoice.",
    });
  }

  // 2. PO number supplied but not found in the register.
  if (hasPo && !matchedPo) {
    flags.push({
      code: "PO_NOT_FOUND",
      severity: "high",
      message: `PO ${invoice.poNumber} does not exist in the purchase order register.`,
    });
  }

  // 3. Vendor is not on the approved-vendor list.
  const vendorApproved = ctx.approvedVendors.some((v) => norm(v) === norm(invoice.vendorName));
  if (!vendorApproved) {
    flags.push({
      code: "UNKNOWN_VENDOR",
      severity: "high",
      message: `"${invoice.vendorName}" is not a recognised, approved vendor.`,
    });
  }

  if (matchedPo) {
    // 4. The matched PO is Closed — spend against it is not permitted.
    if (norm(matchedPo.status) === "closed") {
      flags.push({
        code: "PO_CLOSED",
        severity: "high",
        message: `PO ${matchedPo.poNumber} is Closed and cannot accept new invoices.`,
      });
    }

    // 5. Invoice vendor differs from the vendor named on the PO.
    if (norm(matchedPo.vendorName) !== norm(invoice.vendorName)) {
      flags.push({
        code: "VENDOR_MISMATCH",
        severity: "high",
        message: `Invoice vendor "${invoice.vendorName}" does not match PO vendor "${matchedPo.vendorName}".`,
      });
    }

    // 6/7. Amount vs approved amount.
    const delta = +(invoice.amount - matchedPo.approvedAmount).toFixed(2);
    if (delta > 0) {
      flags.push({
        code: "OVER_PO",
        severity: "medium",
        message: `Invoice is ${money(delta)} over the approved PO amount of ${money(
          matchedPo.approvedAmount,
        )}.`,
      });
    } else if (delta < 0) {
      flags.push({
        code: "UNDER_PO",
        severity: "low",
        message: `Invoice is ${money(Math.abs(delta))} under the PO — likely a partial invoice.`,
      });
    }
  }

  // 8. Duplicate submission: same vendor + PO + amount as an earlier invoice.
  const dup = ctx.priorInvoices.find(
    (p) =>
      p.invoiceNumber !== invoice.invoiceNumber &&
      norm(p.vendorName) === norm(invoice.vendorName) &&
      norm(p.poNumber ?? "") === norm(invoice.poNumber ?? "") &&
      Math.abs(p.amount - invoice.amount) < 0.005,
  );
  if (dup) {
    flags.push({
      code: "DUPLICATE",
      severity: "high",
      message: `Appears to duplicate invoice ${dup.invoiceNumber} (same vendor, PO and amount).`,
    });
  }

  return { hasException: flags.length > 0, flags, matchedPo };
}

/**
 * Safe, rules-only recommendation. Used when the LLM is unavailable (fallback)
 * and as the "ground truth" the LLM is asked to align with. The bias is
 * deliberately conservative: anything that looks like unauthorised or unmatched
 * spend is rejected; anything ambiguous is escalated to a human; only clean or
 * clearly-partial invoices are auto-suggested for approval.
 */
export function deriveFallbackDecision(flags: ExceptionFlag[]): {
  recommendation: Decision;
  rationale: string;
} {
  const codes = new Set(flags.map((f) => f.code));

  if (flags.length === 0) {
    return {
      recommendation: "approve",
      rationale: "Invoice matches its purchase order on vendor, amount and status with no exceptions.",
    };
  }

  const rejectTriggers =
    codes.has("PO_NOT_FOUND") ||
    codes.has("PO_CLOSED") ||
    (codes.has("MISSING_PO") && codes.has("UNKNOWN_VENDOR"));

  if (rejectTriggers) {
    return {
      recommendation: "reject",
      rationale: flags.map((f) => f.message).join(" "),
    };
  }

  // Only an under-PO (partial) flag → still safe to approve.
  if (codes.size === 1 && codes.has("UNDER_PO")) {
    return {
      recommendation: "approve",
      rationale: flags[0].message + " Partial billing against an open PO is acceptable.",
    };
  }

  return {
    recommendation: "escalate",
    rationale: flags.map((f) => f.message).join(" "),
  };
}
