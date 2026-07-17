/**
 * Seed script — loads Appendix A (PO register + invoice batch) plus a derived
 * approved-vendor list and two demo users. Run with `npm run db:seed`, or
 * automatically via `prisma migrate reset`.
 *
 * Invoices are loaded in their un-triaged `pending` state (no AI fields set) so
 * that the live demo can trigger the AI triage on-screen rather than showing
 * pre-baked answers.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// --- Appendix A1: Purchase Order register -------------------------------------
const purchaseOrders = [
  { poNumber: "PO-2024-001", vendorName: "Acme Consulting Ltd", approvedAmount: 45000, costCentre: "IT-Operations", status: "Open" },
  { poNumber: "PO-2024-002", vendorName: "Global Print Co", approvedAmount: 3200, costCentre: "Marketing", status: "Open" },
  { poNumber: "PO-2024-003", vendorName: "FastCloud Infra", approvedAmount: 12800, costCentre: "IT-Infrastructure", status: "Open" },
  { poNumber: "PO-2024-004", vendorName: "Meridian Legal", approvedAmount: 28500, costCentre: "Legal", status: "Open" },
  { poNumber: "PO-2024-005", vendorName: "Acme Consulting Ltd", approvedAmount: 18000, costCentre: "Finance", status: "Closed" },
  { poNumber: "PO-2024-006", vendorName: "OfficeHub Supplies", approvedAmount: 1450, costCentre: "Admin", status: "Open" },
  { poNumber: "PO-2024-007", vendorName: "TechForce Recruitment", approvedAmount: 67000, costCentre: "HR", status: "Open" },
  { poNumber: "PO-2024-008", vendorName: "BlueSky Travel", approvedAmount: 9100, costCentre: "Travel", status: "Open" },
  { poNumber: "PO-2024-009", vendorName: "DataBridge Analytics", approvedAmount: 33000, costCentre: "Finance", status: "Open" },
  { poNumber: "PO-2024-010", vendorName: "SecureVault Storage", approvedAmount: 5600, costCentre: "IT-Operations", status: "Open" },
];

// --- Appendix A2: Invoice batch (mix of clean + exception cases) --------------
// `poNumber: null` models a genuinely missing PO reference field.
const invoices = [
  { invoiceNumber: "INV-001", vendorName: "Acme Consulting Ltd", poNumber: "PO-2024-001", amount: 45000 },
  { invoiceNumber: "INV-002", vendorName: "Global Print Co", poNumber: "PO-2024-002", amount: 3850 },
  { invoiceNumber: "INV-003", vendorName: "FastCloud Infra", poNumber: "PO-2024-003", amount: 12800 },
  { invoiceNumber: "INV-004", vendorName: "Unknown Vendor XYZ", poNumber: null, amount: 7200 },
  { invoiceNumber: "INV-005", vendorName: "Meridian Legal", poNumber: "PO-2024-004", amount: 28500 },
  { invoiceNumber: "INV-006", vendorName: "Acme Consulting Ltd", poNumber: "PO-2024-001", amount: 45000 },
  { invoiceNumber: "INV-007", vendorName: "OfficeHub Supplies", poNumber: "PO-2024-006", amount: 1200 },
  { invoiceNumber: "INV-008", vendorName: "TechForce Recruitment", poNumber: "PO-2024-007", amount: 71000 },
  { invoiceNumber: "INV-009", vendorName: "BlueSky Travel", poNumber: "PO-2024-999", amount: 9100 },
  { invoiceNumber: "INV-010", vendorName: "DataBridge Analytics", poNumber: "PO-2024-009", amount: 33000 },
  { invoiceNumber: "INV-011", vendorName: "SecureVault Storage", poNumber: "PO-2024-005", amount: 5600 },
  { invoiceNumber: "INV-012", vendorName: "Global Print Co", poNumber: "PO-2024-002", amount: 3200 },
  { invoiceNumber: "INV-013", vendorName: "Acme Consulting Ltd", poNumber: "PO-2024-005", amount: 18000 },
  { invoiceNumber: "INV-014", vendorName: "DataBridge Analytics", poNumber: null, amount: 33000 },
  { invoiceNumber: "INV-015", vendorName: "FastCloud Infra", poNumber: "PO-2024-003", amount: 14000 },
];

async function main() {
  // Order matters because of FK relations; delete children first.
  await prisma.auditLog.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.user.deleteMany();

  // Approved vendors are the distinct vendor names appearing on the PO register.
  const vendorNames = Array.from(new Set(purchaseOrders.map((p) => p.vendorName)));
  const vendorByName = new Map<string, number>();
  for (const name of vendorNames) {
    const v = await prisma.vendor.create({ data: { name } });
    vendorByName.set(name, v.id);
  }

  for (const po of purchaseOrders) {
    await prisma.purchaseOrder.create({
      data: {
        poNumber: po.poNumber,
        vendorId: vendorByName.get(po.vendorName)!,
        vendorName: po.vendorName,
        approvedAmount: po.approvedAmount,
        costCentre: po.costCentre,
        status: po.status,
      },
    });
  }

  for (const inv of invoices) {
    await prisma.invoice.create({
      data: {
        invoiceNumber: inv.invoiceNumber,
        vendorName: inv.vendorName,
        poNumber: inv.poNumber ?? undefined,
        amount: inv.amount,
        status: "pending",
        source: "seed",
      },
    });
  }

  // Two demo users. Passwords are bcrypt-hashed at rest.
  const users = [
    { email: "analyst@financeos.dev", role: "analyst", password: "demo1234" },
    { email: "approver@financeos.dev", role: "approver", password: "demo1234" },
  ];
  for (const u of users) {
    await prisma.user.create({
      data: { email: u.email, role: u.role, password: await bcrypt.hash(u.password, 10) },
    });
  }

  console.log(
    `Seeded: ${vendorNames.length} vendors, ${purchaseOrders.length} POs, ` +
      `${invoices.length} invoices, ${users.length} users.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
