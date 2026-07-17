import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { runTriage } from "@/lib/triage-service";
import { writeAudit } from "@/lib/audit";
import { serializeInvoice } from "@/lib/serialize";

// GET /api/invoices — list all invoices (newest first) for the list view.
export async function GET() {
  const invoices = await prisma.invoice.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ invoices: invoices.map(serializeInvoice) });
}

const createSchema = z.object({
  invoiceNumber: z.string().trim().min(1).optional(),
  vendorName: z.string().trim().min(1, "Vendor name is required."),
  poNumber: z.string().trim().optional().nullable(),
  amount: z.number().positive("Amount must be greater than zero."),
  source: z.enum(["manual", "json", "pdf"]).optional(),
});

// POST /api/invoices — create an invoice, then immediately run AI triage on it.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid invoice." },
      { status: 400 },
    );
  }

  const data = parsed.data;
  // Auto-generate a unique invoice number if none supplied (e.g. manual entry).
  const invoiceNumber =
    data.invoiceNumber || `INV-${Date.now().toString().slice(-6)}`;

  const existing = await prisma.invoice.findUnique({ where: { invoiceNumber } });
  if (existing) {
    return NextResponse.json(
      { error: `Invoice ${invoiceNumber} already exists.` },
      { status: 409 },
    );
  }

  const created = await prisma.invoice.create({
    data: {
      invoiceNumber,
      vendorName: data.vendorName,
      poNumber: data.poNumber?.trim() || null,
      amount: data.amount,
      status: "pending",
      source: data.source ?? "manual",
    },
  });

  await writeAudit({
    userId: user?.id,
    entityType: "invoice",
    entityId: created.id,
    action: "create",
    newValue: { invoiceNumber, vendorName: data.vendorName, amount: data.amount },
  });

  // Run matching + LLM triage synchronously so the UI can show the result.
  const { invoice } = await runTriage(created.id, user?.id);

  return NextResponse.json({ invoice: serializeInvoice(invoice) }, { status: 201 });
}
