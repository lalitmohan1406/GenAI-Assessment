import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { runTriage } from "@/lib/triage-service";
import { serializeInvoice } from "@/lib/serialize";

/**
 * POST /api/invoices/:id/retriage — re-run AI triage on an existing invoice.
 * Used for the seeded invoices (which load un-triaged) so the demo can trigger
 * the AI live, and to retry after a fallback (e.g. once an API key is added).
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const user = await getCurrentUser();
  const exists = await prisma.invoice.findUnique({ where: { id } });
  if (!exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { invoice } = await runTriage(id, user?.id);
  return NextResponse.json({ invoice: serializeInvoice(invoice) });
}
