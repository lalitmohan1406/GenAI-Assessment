import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeInvoice } from "@/lib/serialize";

// GET /api/invoices/:id — one invoice plus the PO it references (if any),
// so the detail page can show the approved amount / cost centre / PO status.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const matchedPo = invoice.poNumber
    ? await prisma.purchaseOrder.findUnique({ where: { poNumber: invoice.poNumber } })
    : null;

  return NextResponse.json({
    invoice: serializeInvoice(invoice),
    matchedPo: matchedPo
      ? {
          poNumber: matchedPo.poNumber,
          vendorName: matchedPo.vendorName,
          approvedAmount: matchedPo.approvedAmount,
          costCentre: matchedPo.costCentre,
          status: matchedPo.status,
        }
      : null,
  });
}
