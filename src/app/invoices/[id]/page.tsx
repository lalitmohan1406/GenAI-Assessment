"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, DecisionBadge, SeverityDot, money } from "@/components/ui";

interface Flag {
  code: string;
  severity: string;
  message: string;
}
interface InvoiceDetail {
  id: number;
  invoiceNumber: string;
  vendorName: string;
  poNumber: string | null;
  amount: number;
  status: string;
  hasException: boolean;
  flags: Flag[];
  ai: {
    recommendation: string | null;
    rationale: string | null;
    confidence: number | null;
    model: string | null;
    source: string | null;
  };
  humanOverride: string | null;
  overrideNote: string | null;
  resolvedAt: string | null;
}
interface MatchedPo {
  poNumber: string;
  vendorName: string;
  approvedAmount: number;
  costCentre: string;
  status: string;
}

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [matchedPo, setMatchedPo] = useState<MatchedPo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/invoices/${id}`);
    const data = await res.json();
    setInvoice(data.invoice);
    setMatchedPo(data.matchedPo);
    setNote(data.invoice?.overrideNote ?? "");
  }, [id]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function retriage() {
    setActionError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/invoices/${id}/retriage`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setActionError(body.error ?? "AI triage failed — please try again.");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function decide(decision: "approve" | "escalate" | "reject") {
    setActionError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/invoices/${id}/override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: note.trim() || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setActionError(body.error ?? "Could not record your decision — please try again.");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-slate-500">Loading invoice…</p>;
  if (!invoice) return <p className="text-slate-500">Invoice not found.</p>;

  const triaged = !!invoice.ai.recommendation;
  const isOverride =
    invoice.humanOverride && invoice.humanOverride !== invoice.ai.recommendation;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/invoices" className="text-sm text-slate-500 hover:underline">
            ← Back to invoices
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{invoice.invoiceNumber}</h1>
        </div>
        <DecisionBadge value={invoice.status} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Invoice + PO facts */}
        <Card title="Invoice details">
          <dl className="space-y-2 text-sm">
            <Row label="Vendor" value={invoice.vendorName} />
            <Row label="PO reference" value={invoice.poNumber ?? "— none provided —"} />
            <Row label="Invoice amount" value={money(invoice.amount)} />
          </dl>
          <div className="mt-4 border-t border-slate-100 pt-4">
            <div className="mb-2 text-sm font-semibold text-slate-700">Matched purchase order</div>
            {matchedPo ? (
              <dl className="space-y-2 text-sm">
                <Row label="PO number" value={matchedPo.poNumber} />
                <Row label="PO vendor" value={matchedPo.vendorName} />
                <Row label="Approved amount" value={money(matchedPo.approvedAmount)} />
                <Row label="Cost centre" value={matchedPo.costCentre} />
                <Row label="PO status" value={matchedPo.status} />
              </dl>
            ) : (
              <p className="text-sm text-rose-600">No matching purchase order found in the register.</p>
            )}
          </div>
        </Card>

        {/* Exceptions */}
        <Card title={`Exceptions detected (${invoice.flags.length})`}>
          {invoice.flags.length === 0 ? (
            <p className="text-sm text-emerald-700">
              Clean match — no discrepancies against the PO register.
            </p>
          ) : (
            <ul className="space-y-3">
              {invoice.flags.map((f) => (
                <li key={f.code} className="flex items-start gap-2 text-sm">
                  <span className="mt-1"><SeverityDot severity={f.severity} /></span>
                  <div>
                    <div className="font-medium text-slate-800">{f.code.replaceAll("_", " ")}</div>
                    <div className="text-slate-600">{f.message}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* AI recommendation */}
      <Card title="AI triage recommendation">
        {!triaged ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">
                This invoice has not been triaged yet. Run AI triage to get a recommendation.
              </p>
              <button onClick={retriage} disabled={busy}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
                {busy ? "Running AI…" : "Run AI triage"}
              </button>
            </div>
            {actionError && (
              <p className="text-sm text-rose-600">{actionError}</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {invoice.ai.source === "fallback" && (
              <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                ⚠️ AI service was unavailable — showing a rules-based fallback recommendation. You
                can{" "}
                <button onClick={retriage} disabled={busy} className="font-semibold underline">
                  retry the AI
                </button>{" "}
                once the model is reachable.
              </div>
            )}
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-500">Recommendation:</span>
              <DecisionBadge value={invoice.ai.recommendation} />
              {invoice.ai.confidence !== null && (
                <span className="text-sm text-slate-500">
                  confidence {Math.round((invoice.ai.confidence ?? 0) * 100)}%
                </span>
              )}
              <span className="ml-auto text-xs text-slate-400">
                {invoice.ai.source === "llm" ? `via ${invoice.ai.model}` : "rules-based fallback"}
              </span>
            </div>
            <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">
              {invoice.ai.rationale}
            </p>
          </div>
        )}
      </Card>

      {/* Human decision */}
      <Card title="Your decision (human review)">
        {invoice.humanOverride ? (
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Recorded decision:</span>
              <DecisionBadge value={invoice.humanOverride} />
              {isOverride ? (
                <span className="rounded bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
                  Overrode AI ({invoice.ai.recommendation})
                </span>
              ) : (
                <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  Agreed with AI
                </span>
              )}
            </div>
            {invoice.overrideNote && (
              <p className="text-slate-600">Note: {invoice.overrideNote}</p>
            )}
            <button onClick={() => setInvoice({ ...invoice, humanOverride: null })}
              className="text-xs text-slate-400 underline">
              Change decision
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              The AI only recommends — you make the final call. Add an optional note for the audit
              trail.
            </p>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
              placeholder="Optional note (e.g. 'Confirmed with vendor over phone')"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none" />
            <div className="flex gap-2">
              <DecisionButton onClick={() => decide("approve")} disabled={busy || !triaged} tone="good">
                Approve invoice
              </DecisionButton>
              <DecisionButton onClick={() => decide("escalate")} disabled={busy || !triaged} tone="warn">
                Escalate
              </DecisionButton>
              <DecisionButton onClick={() => decide("reject")} disabled={busy || !triaged} tone="bad">
                Reject
              </DecisionButton>
            </div>
            {!triaged && (
              <p className="text-xs text-slate-400">Run AI triage first to enable a decision.</p>
            )}
            {actionError && (
              <p className="text-sm text-rose-600">{actionError}</p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-800">{value}</dd>
    </div>
  );
}

function DecisionButton({
  children,
  onClick,
  disabled,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
  tone: "good" | "warn" | "bad";
}) {
  const cls =
    tone === "good"
      ? "bg-emerald-600 hover:bg-emerald-500"
      : tone === "warn"
        ? "bg-amber-500 hover:bg-amber-400"
        : "bg-rose-600 hover:bg-rose-500";
  return (
    <button onClick={onClick} disabled={disabled}
      className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${cls}`}>
      {children}
    </button>
  );
}
