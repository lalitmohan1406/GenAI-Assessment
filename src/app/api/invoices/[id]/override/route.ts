import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { serializeInvoice } from "@/lib/serialize";

/**
 * POST /api/invoices/:id/override — a human records the FINAL decision.
 * This is the human-in-the-loop gate: the AI only ever recommends; a person
 * resolves. We store the human decision, set the workflow status + resolution
 * time, and audit whether the human agreed with or overrode the AI.
 */
const bodySchema = z.object({
  decision: z.enum(["approve", "escalate", "reject"]),
  note: z.string().trim().max(500).optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const user = await getCurrentUser();
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "A valid decision is required." }, { status: 400 });
  }

  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Human-in-the-loop is a hard rule, enforced server-side (not just via the
  // disabled UI button): a person can only accept or override a recommendation
  // that exists. Resolving an un-triaged invoice would also corrupt the
  // override-rate metric, since there would be no AI decision to compare against.
  if (!invoice.aiRecommendation) {
    return NextResponse.json(
      { error: "Run AI triage before recording a decision." },
      { status: 409 },
    );
  }

  const { decision, note } = parsed.data;
  // "Override" strictly means the human chose differently from the AI. If they
  // agreed, we still record the human decision (that is a confirmation signal).
  const isOverride = invoice.aiRecommendation !== decision;

  const updated = await prisma.invoice.update({
    where: { id },
    data: {
      humanOverride: decision,
      overrideNote: note ?? null,
      status: decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "escalated",
      resolvedById: user?.id ?? null,
      resolvedAt: new Date(),
    },
  });

  await writeAudit({
    userId: user?.id,
    entityType: "invoice",
    entityId: id,
    action: isOverride ? "human_override" : "human_confirm",
    oldValue: { aiRecommendation: invoice.aiRecommendation },
    newValue: { humanDecision: decision, isOverride, note: note ?? null },
  });

  return NextResponse.json({ invoice: serializeInvoice(updated), isOverride });
}
