"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card, DecisionBadge, money, ButtonLink } from "@/components/ui";

type Filter = "all" | "exceptions" | "pending" | "approved" | "escalated" | "rejected";
const FILTERS: Filter[] = ["all", "pending", "approved", "escalated", "rejected", "exceptions"];

interface InvoiceRow {
  id: number;
  invoiceNumber: string;
  vendorName: string;
  poNumber: string | null;
  amount: number;
  status: string;
  hasException: boolean;
  ai: { recommendation: string | null; source: string | null };
  humanOverride: string | null;
}

export default function InvoicesPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading invoices…</p>}>
      <InvoicesPageInner />
    </Suspense>
  );
}

function InvoicesPageInner() {
  const searchParams = useSearchParams();
  const initialFilter = FILTERS.includes(searchParams.get("status") as Filter)
    ? (searchParams.get("status") as Filter)
    : "all";

  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>(initialFilter);

  useEffect(() => {
    fetch("/api/invoices")
      .then((r) => r.json())
      .then((d) => setInvoices(d.invoices ?? []))
      .finally(() => setLoading(false));
  }, []);

  const shown = invoices.filter((i) => {
    if (filter === "all") return true;
    if (filter === "exceptions") return i.hasException;
    return i.status === filter;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Invoices</h1>
          <p className="text-sm text-slate-500">
            Every invoice, its exception status and the AI triage recommendation.
          </p>
        </div>
        <ButtonLink href="/invoices/new">+ New invoice</ButtonLink>
      </div>

      <div className="flex gap-2 text-sm">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg px-3 py-1.5 font-medium capitalize ${
              filter === f ? "bg-brand-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <Card>
        {loading ? (
          <p className="text-sm text-slate-500">Loading invoices…</p>
        ) : shown.length === 0 ? (
          <p className="text-sm text-slate-500">No invoices match this filter.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr className="border-b border-slate-100">
                <th className="py-2">Invoice</th>
                <th>Vendor</th>
                <th>PO</th>
                <th className="text-right">Amount</th>
                <th>Exception</th>
                <th>AI rec.</th>
                <th>Human</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((inv) => (
                <tr key={inv.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-2">
                    <Link href={`/invoices/${inv.id}`} className="font-medium text-slate-900 hover:underline">
                      {inv.invoiceNumber}
                    </Link>
                  </td>
                  <td className="text-slate-600">{inv.vendorName}</td>
                  <td className="text-slate-500">{inv.poNumber ?? "—"}</td>
                  <td className="text-right tabular-nums">{money(inv.amount)}</td>
                  <td>{inv.hasException ? <span className="text-rose-600">Yes</span> : <span className="text-slate-400">No</span>}</td>
                  <td>
                    <DecisionBadge value={inv.ai.recommendation} />
                    {inv.ai.source === "fallback" && (
                      <span className="ml-1 text-[10px] uppercase text-amber-600">fallback</span>
                    )}
                  </td>
                  <td><DecisionBadge value={inv.humanOverride} /></td>
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
