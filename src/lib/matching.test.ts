/**
 * Lightweight test harness (no framework — run with `npm run test:matching`).
 *
 * It feeds the 15 Appendix A2 invoices through the matching engine + fallback
 * decision logic and asserts the resulting recommendation equals the
 * "Expected AI Output" column from the assessment. This is our safety net: it
 * proves the deterministic layer is correct independent of the LLM.
 */
import {
  computeExceptions,
  deriveFallbackDecision,
  type PoRecord,
  type InvoiceInput,
  type Decision,
} from "./matching";

const purchaseOrders: PoRecord[] = [
  { poNumber: "PO-2024-001", vendorName: "Acme Consulting Ltd", approvedAmount: 45000, status: "Open" },
  { poNumber: "PO-2024-002", vendorName: "Global Print Co", approvedAmount: 3200, status: "Open" },
  { poNumber: "PO-2024-003", vendorName: "FastCloud Infra", approvedAmount: 12800, status: "Open" },
  { poNumber: "PO-2024-004", vendorName: "Meridian Legal", approvedAmount: 28500, status: "Open" },
  { poNumber: "PO-2024-005", vendorName: "Acme Consulting Ltd", approvedAmount: 18000, status: "Closed" },
  { poNumber: "PO-2024-006", vendorName: "OfficeHub Supplies", approvedAmount: 1450, status: "Open" },
  { poNumber: "PO-2024-007", vendorName: "TechForce Recruitment", approvedAmount: 67000, status: "Open" },
  { poNumber: "PO-2024-008", vendorName: "BlueSky Travel", approvedAmount: 9100, status: "Open" },
  { poNumber: "PO-2024-009", vendorName: "DataBridge Analytics", approvedAmount: 33000, status: "Open" },
  { poNumber: "PO-2024-010", vendorName: "SecureVault Storage", approvedAmount: 5600, status: "Open" },
];

const approvedVendors = Array.from(new Set(purchaseOrders.map((p) => p.vendorName)));

const batch: (InvoiceInput & { expected: Decision })[] = [
  { invoiceNumber: "INV-001", vendorName: "Acme Consulting Ltd", poNumber: "PO-2024-001", amount: 45000, expected: "approve" },
  { invoiceNumber: "INV-002", vendorName: "Global Print Co", poNumber: "PO-2024-002", amount: 3850, expected: "escalate" },
  { invoiceNumber: "INV-003", vendorName: "FastCloud Infra", poNumber: "PO-2024-003", amount: 12800, expected: "approve" },
  { invoiceNumber: "INV-004", vendorName: "Unknown Vendor XYZ", poNumber: null, amount: 7200, expected: "reject" },
  { invoiceNumber: "INV-005", vendorName: "Meridian Legal", poNumber: "PO-2024-004", amount: 28500, expected: "approve" },
  { invoiceNumber: "INV-006", vendorName: "Acme Consulting Ltd", poNumber: "PO-2024-001", amount: 45000, expected: "escalate" },
  { invoiceNumber: "INV-007", vendorName: "OfficeHub Supplies", poNumber: "PO-2024-006", amount: 1200, expected: "approve" },
  { invoiceNumber: "INV-008", vendorName: "TechForce Recruitment", poNumber: "PO-2024-007", amount: 71000, expected: "escalate" },
  { invoiceNumber: "INV-009", vendorName: "BlueSky Travel", poNumber: "PO-2024-999", amount: 9100, expected: "reject" },
  { invoiceNumber: "INV-010", vendorName: "DataBridge Analytics", poNumber: "PO-2024-009", amount: 33000, expected: "approve" },
  { invoiceNumber: "INV-011", vendorName: "SecureVault Storage", poNumber: "PO-2024-005", amount: 5600, expected: "reject" },
  { invoiceNumber: "INV-012", vendorName: "Global Print Co", poNumber: "PO-2024-002", amount: 3200, expected: "approve" },
  { invoiceNumber: "INV-013", vendorName: "Acme Consulting Ltd", poNumber: "PO-2024-005", amount: 18000, expected: "reject" },
  { invoiceNumber: "INV-014", vendorName: "DataBridge Analytics", poNumber: null, amount: 33000, expected: "escalate" },
  { invoiceNumber: "INV-015", vendorName: "FastCloud Infra", poNumber: "PO-2024-003", amount: 14000, expected: "escalate" },
];

// Duplicate detection needs the prior invoices as context. We build it up
// incrementally so INV-006 "sees" INV-001 already loaded, mirroring real intake.
const prior: InvoiceInput[] = [];
let pass = 0;
let fail = 0;

for (const inv of batch) {
  const { flags } = computeExceptions(inv, {
    purchaseOrders,
    approvedVendors,
    priorInvoices: prior,
  });
  const { recommendation } = deriveFallbackDecision(flags);
  const ok = recommendation === inv.expected;
  ok ? pass++ : fail++;
  const codes = flags.map((f) => f.code).join(", ") || "(clean)";
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${inv.invoiceNumber}  expected=${inv.expected} got=${recommendation}  [${codes}]`,
  );
  prior.push(inv);
}

console.log(`\n${pass}/${batch.length} passed, ${fail} failed.`);
if (fail > 0) process.exit(1);
