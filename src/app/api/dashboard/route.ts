import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/dashboard — the operational metrics the assessment asks for:
 * exception volume, AI-vs-human override rate, and average resolution time,
 * plus a status breakdown for the workqueue view.
 */
export async function GET() {
  const invoices = await prisma.invoice.findMany();

  const total = invoices.length;
  const withException = invoices.filter((i) => i.hasException).length;

  // Resolved = a human recorded a final decision on an invoice the AI triaged.
  // The AI recommendation must exist for "AI vs human override rate" to mean
  // anything — comparing a human decision against a null recommendation would
  // count as an override and inflate the metric.
  const resolved = invoices.filter((i) => i.humanOverride && i.resolvedAt && i.aiRecommendation);
  const overrides = resolved.filter((i) => i.humanOverride !== i.aiRecommendation);

  // Average resolution time in seconds (createdAt -> resolvedAt).
  const avgResolutionSeconds =
    resolved.length === 0
      ? null
      : Math.round(
          resolved.reduce(
            (sum, i) => sum + (i.resolvedAt!.getTime() - i.createdAt.getTime()) / 1000,
            0,
          ) / resolved.length,
        );

  const statusBreakdown = {
    pending: invoices.filter((i) => i.status === "pending").length,
    approved: invoices.filter((i) => i.status === "approved").length,
    escalated: invoices.filter((i) => i.status === "escalated").length,
    rejected: invoices.filter((i) => i.status === "rejected").length,
  };

  const triaged = invoices.filter((i) => i.aiRecommendation).length;
  const fallbackCount = invoices.filter((i) => i.aiSource === "fallback").length;

  return NextResponse.json({
    metrics: {
      totalInvoices: total,
      exceptionsFlagged: withException,
      exceptionRatePct: total ? Math.round((withException / total) * 1000) / 10 : 0,
      triaged,
      resolved: resolved.length,
      overrideCount: overrides.length,
      overrideRatePct: resolved.length
        ? Math.round((overrides.length / resolved.length) * 1000) / 10
        : 0,
      avgResolutionSeconds,
      fallbackCount,
      statusBreakdown,
    },
  });
}
