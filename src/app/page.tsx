"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatCard, Card, DecisionBadge, money, ButtonLink } from "@/components/ui";

interface Metrics {
  totalInvoices: number;
  exceptionsFlagged: number;
  exceptionRatePct: number;
  triaged: number;
  resolved: number;
  overrideCount: number;
  overrideRatePct: number;
  avgResolutionSeconds: number | null;
  fallbackCount: number;
  statusBreakdown: { pending: number; approved: number; escalated: number; rejected: number };
}

interface InvoiceRow {
  id: number;
  invoiceNumber: string;
  vendorName: string;
  amount: number;
  status: string;
  hasException: boolean;
  ai: { recommendation: string | null; source: string | null };
}

function fmtDuration(seconds: number | null) {
  if (seconds === null) return "—";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  return `${m}m ${seconds % 60}s`;
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/dashboard").then((r) => r.json()),
      fetch("/api/invoices").then((r) => r.json()),
    ])
      .then(([d, i]) => {
        setMetrics(d.metrics);
        setInvoices((i.invoices ?? []).slice(0, 8));
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="text-slate-500">Loading dashboard…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500">
            Live view of invoice exception volume, AI-vs-human override rate and resolution time.
          </p>
        </div>
        <ButtonLink href="/invoices/new">+ New invoice</ButtonLink>
      </div>

      {metrics && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Exceptions flagged"
            value={`${metrics.exceptionsFlagged} / ${metrics.totalInvoices}`}
            hint={`${metrics.exceptionRatePct}% of invoices hit an exception`}
            tone={metrics.exceptionRatePct > 25 ? "warn" : "default"}
          />
          <StatCard
            label="Human override rate"
            value={`${metrics.overrideRatePct}%`}
            hint={`${metrics.overrideCount} overrides of ${metrics.resolved} resolved`}
            tone={metrics.overrideRatePct > 30 ? "warn" : "good"}
          />
          <StatCard
            label="Avg. resolution time"
            value={fmtDuration(metrics.avgResolutionSeconds)}
            hint={`${metrics.resolved} invoices resolved by a human`}
          />
          <StatCard
            label="AI fallbacks"
            value={`${metrics.fallbackCount}`}
            hint="Times the rules-based fallback was used"
            tone={metrics.fallbackCount > 0 ? "warn" : "good"}
          />
        </div>
      )}

      {metrics && (
        <Card title="Workqueue status">
          <div className="flex flex-wrap gap-6 text-sm">
            <Link href="/invoices?status=pending" className="hover:underline">
              Pending review: <strong>{metrics.statusBreakdown.pending}</strong>
            </Link>
            <Link href="/invoices?status=approved" className="hover:underline">
              Approved: <strong className="text-emerald-600">{metrics.statusBreakdown.approved}</strong>
            </Link>
            <Link href="/invoices?status=escalated" className="hover:underline">
              Escalated: <strong className="text-amber-600">{metrics.statusBreakdown.escalated}</strong>
            </Link>
            <Link href="/invoices?status=rejected" className="hover:underline">
              Rejected: <strong className="text-rose-600">{metrics.statusBreakdown.rejected}</strong>
            </Link>
          </div>
        </Card>
      )}

      <Card title="Recent invoices">
        {invoices.length === 0 ? (
          <p className="text-sm text-slate-500">No invoices yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr className="border-b border-slate-100">
                <th className="py-2">Invoice</th>
                <th>Vendor</th>
                <th className="text-right">Amount</th>
                <th>Exception</th>
                <th>AI rec.</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-2">
                    <Link href={`/invoices/${inv.id}`} className="font-medium text-slate-900 hover:underline">
                      {inv.invoiceNumber}
                    </Link>
                  </td>
                  <td className="text-slate-600">{inv.vendorName}</td>
                  <td className="text-right tabular-nums">{money(inv.amount)}</td>
                  <td>{inv.hasException ? <span className="text-rose-600">Yes</span> : <span className="text-slate-400">No</span>}</td>
                  <td>
                    <DecisionBadge value={inv.ai.recommendation} />
                    {inv.ai.source === "fallback" && (
                      <span className="ml-1 text-[10px] uppercase text-amber-600">fallback</span>
                    )}
                  </td>
                  <td><DecisionBadge value={inv.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
