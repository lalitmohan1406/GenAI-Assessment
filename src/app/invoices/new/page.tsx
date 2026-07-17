"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, DecisionBadge, money, ButtonLink } from "@/components/ui";

/**
 * Two intake modes (assessment: "PDF or structured JSON, or manual entry"):
 *  - manual entry of the four invoice fields, and
 *  - upload of a structured JSON file that pre-fills those fields.
 * The JSON may be a single invoice object OR an array of them (also accepts a
 * { "invoices": [...] } wrapper), which switches into batch triage mode.
 * PDF intake is intentionally out of scope for the PoC (see design-decisions.md);
 * structured JSON models the realistic ERP/e-invoicing integration path.
 */

type Fields = { invoiceNumber: string; vendorName: string; poNumber: string; amount: string };

type BatchRow = {
  input: Fields;
  status: "queued" | "running" | "done" | "error";
  result?: {
    id: number;
    invoiceNumber: string;
    status: string;
    recommendation: string | null;
    source: string | null;
    rationale: string | null;
    confidence: number | null;
  };
  error?: string;
  // Human-in-the-loop: the reviewer's recorded decision for this row.
  decision?: "approve" | "escalate" | "reject" | null;
  deciding?: boolean;
  decideError?: string;
};

// Normalise the loose key variants an ERP / e-invoicing export might use.
function normalize(raw: Record<string, unknown> | null | undefined): Fields {
  const r = raw ?? {};
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = r[k];
      if (v !== undefined && v !== null && v !== "") return String(v);
    }
    return "";
  };
  return {
    invoiceNumber: pick("invoiceNumber", "invoice_number"),
    vendorName: pick("vendorName", "vendor", "vendor_name"),
    poNumber: pick("poNumber", "po", "po_number"),
    amount: pick("amount"),
  };
}

export default function NewInvoicePage() {
  const router = useRouter();
  const [form, setForm] = useState<Fields>({ invoiceNumber: "", vendorName: "", poNumber: "", amount: "" });
  const [source, setSource] = useState<"manual" | "json">("manual");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Batch mode: populated when the uploaded JSON is an array of invoices.
  const [batch, setBatch] = useState<BatchRow[] | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);

  function set<K extends keyof Fields>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const list: unknown[] | null = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.invoices)
        ? parsed.invoices
        : null;

      if (list) {
        // Multiple invoices → batch mode.
        if (list.length === 0) {
          setError("That file contains an empty list — no invoices to create.");
        } else {
          setBatch(
            list.map((raw) => ({
              input: normalize(raw as Record<string, unknown>),
              status: "queued" as const,
            })),
          );
          setSource("json");
          setError(null);
        }
      } else {
        // Single invoice object → fill the form for review (existing behaviour).
        setForm(normalize(parsed));
        setBatch(null);
        setSource("json");
        setError(null);
      }
    } catch {
      setError("That file is not valid JSON. Expected an invoice object, or an array of them.");
    } finally {
      // Reset so re-selecting the same file fires onChange again.
      input.value = "";
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amountNum = Number(form.amount);
    if (!form.vendorName.trim()) return setError("Vendor name is required.");
    if (!Number.isFinite(amountNum) || amountNum <= 0) return setError("Enter a valid amount.");

    setSubmitting(true);
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceNumber: form.invoiceNumber.trim() || undefined,
          vendorName: form.vendorName.trim(),
          poNumber: form.poNumber.trim() || null,
          amount: amountNum,
          source,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not create the invoice.");
        return;
      }
      // Straight to the triage result for this invoice.
      router.push(`/invoices/${data.invoice.id}`);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onSubmitBatch() {
    if (!batch) return;
    setBatchRunning(true);
    const rows = batch.map((r) => ({ ...r }));
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const amountNum = Number(row.input.amount);
      if (!row.input.vendorName.trim() || !Number.isFinite(amountNum) || amountNum <= 0) {
        rows[i] = { ...row, status: "error", error: "Needs a vendor name and a valid amount." };
        setBatch([...rows]);
        continue;
      }
      rows[i] = { ...row, status: "running" };
      setBatch([...rows]);
      try {
        const res = await fetch("/api/invoices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            invoiceNumber: row.input.invoiceNumber.trim() || undefined,
            vendorName: row.input.vendorName.trim(),
            poNumber: row.input.poNumber.trim() || null,
            amount: amountNum,
            source: "json",
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          rows[i] = { ...row, status: "error", error: data.error ?? "Could not create the invoice." };
        } else {
          rows[i] = {
            ...row,
            status: "done",
            result: {
              id: data.invoice.id,
              invoiceNumber: data.invoice.invoiceNumber,
              status: data.invoice.status,
              recommendation: data.invoice.ai?.recommendation ?? null,
              source: data.invoice.ai?.source ?? null,
              rationale: data.invoice.ai?.rationale ?? null,
              confidence: data.invoice.ai?.confidence ?? null,
            },
          };
        }
      } catch {
        rows[i] = { ...row, status: "error", error: "Network error." };
      }
      setBatch([...rows]);
    }
    setBatchRunning(false);
  }

  // Human-in-the-loop: record the reviewer's final call for one triaged row.
  async function decideRow(i: number, decision: "approve" | "escalate" | "reject") {
    if (!batch) return;
    const row = batch[i];
    if (!row.result) return;
    const rows = batch.map((r) => ({ ...r }));
    rows[i] = { ...row, deciding: true, decideError: undefined };
    setBatch(rows);
    try {
      const res = await fetch(`/api/invoices/${row.result.id}/override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json();
      if (!res.ok) {
        rows[i] = { ...rows[i], deciding: false, decideError: data.error ?? "Could not record decision." };
      } else {
        rows[i] = {
          ...rows[i],
          deciding: false,
          decision,
          result: { ...row.result, status: data.invoice.status },
        };
      }
    } catch {
      rows[i] = { ...rows[i], deciding: false, decideError: "Network error — please try again." };
    }
    setBatch([...rows]);
  }

  const field = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none";

  const doneCount = batch?.filter((r) => r.status === "done").length ?? 0;
  const errorCount = batch?.filter((r) => r.status === "error").length ?? 0;
  const decidedCount = batch?.filter((r) => r.decision).length ?? 0;
  const allSettled = batch != null && batch.every((r) => r.status === "done" || r.status === "error");
  // A human decision is required on every successfully triaged row before the
  // reviewer can move on. Error rows never created an invoice, so they don't
  // need (and can't take) a decision.
  const allDecided = decidedCount === doneCount;

  return (
    <div className={`mx-auto space-y-6 ${batch ? "max-w-3xl" : "max-w-2xl"}`}>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">New invoice</h1>
        <p className="text-sm text-slate-500">
          Enter an invoice manually, or upload a structured JSON file — a single invoice or an
          array for batch triage. On submit, each invoice is matched against the PO register and
          run through AI triage.
        </p>
      </div>

      <Card title="Upload structured JSON (optional)">
        <input type="file" accept="application/json,.json" onChange={onFile} className="text-sm" />
        <p className="mt-2 text-xs text-slate-400">
          Accepts a JSON object with keys such as{" "}
          <code className="font-mono">vendorName, poNumber, amount, invoiceNumber</code> — or an
          array of such objects to create and triage several at once.
        </p>
      </Card>

      {batch ? (
        <Card title={`Batch upload — ${batch.length} invoice${batch.length === 1 ? "" : "s"}`}>
          <p className="mb-3 text-xs text-slate-400">
            {allSettled
              ? "Triage complete. The AI only recommends — record your decision on each row, or open an invoice for the full rationale, exceptions and PO match."
              : "Review the parsed invoices, then run AI triage on all of them. You'll record the final human decision per row afterwards."}
          </p>

          <ul className="divide-y divide-slate-100 text-sm">
            {batch.map((r, i) => {
              const amt = Number(r.input.amount);
              return (
                <li key={i} className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900">
                        {r.result ? (
                          <Link href={`/invoices/${r.result.id}`} className="hover:underline">
                            {r.result.invoiceNumber}
                          </Link>
                        ) : (
                          r.input.invoiceNumber || <span className="text-slate-400">(auto number)</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">
                        {r.input.vendorName || <span className="text-rose-600">vendor missing</span>}
                        {" · "}
                        {amt > 0 ? money(amt) : <span className="text-rose-600">no amount</span>}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-3">
                      {r.status === "queued" && <span className="text-slate-400">Queued</span>}
                      {r.status === "running" && <span className="text-slate-500">Running triage…</span>}
                      {r.status === "error" && <span className="text-rose-600">{r.error}</span>}
                      {r.status === "done" && r.result && (
                        <>
                          <span className="inline-flex items-center gap-1 text-slate-500">
                            AI:
                            <DecisionBadge value={r.result.recommendation ?? r.result.status} />
                            {r.result.source === "fallback" && (
                              <span className="text-[10px] uppercase text-amber-600">fallback</span>
                            )}
                          </span>

                          {r.decision ? (
                            <span className="inline-flex items-center gap-2">
                              <span className="text-slate-400">→</span>
                              <DecisionBadge value={r.decision} />
                              {r.decision === r.result.recommendation ? (
                                <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                                  Agreed with AI
                                </span>
                              ) : (
                                <span className="rounded bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
                                  Overrode AI
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="inline-flex gap-1.5">
                              <DecideButton onClick={() => decideRow(i, "approve")} disabled={!!r.deciding} tone="good">
                                Approve
                              </DecideButton>
                              <DecideButton onClick={() => decideRow(i, "escalate")} disabled={!!r.deciding} tone="warn">
                                Escalate
                              </DecideButton>
                              <DecideButton onClick={() => decideRow(i, "reject")} disabled={!!r.deciding} tone="bad">
                                Reject
                              </DecideButton>
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  {r.status === "done" && r.result?.rationale && (
                    <p className="mt-2 text-xs leading-relaxed text-slate-500">
                      <span className="font-medium text-slate-600">AI rationale:</span>{" "}
                      {r.result.rationale}
                      {typeof r.result.confidence === "number" && (
                        <span className="text-slate-400">
                          {" · "}
                          {Math.round(r.result.confidence * 100)}% confidence
                        </span>
                      )}
                    </p>
                  )}
                  {r.decideError && <p className="mt-1 text-right text-xs text-rose-600">{r.decideError}</p>}
                </li>
              );
            })}
          </ul>

          {error && <div className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => {
                setBatch(null);
                setSource("manual");
                setError(null);
              }}
              disabled={batchRunning}
              className="text-sm text-slate-500 hover:text-slate-900 disabled:opacity-50"
            >
              Clear
            </button>
            {allSettled ? (
              <div className="flex items-center gap-4">
                <span className="text-sm text-slate-500">
                  {doneCount} triaged{errorCount ? `, ${errorCount} failed` : ""}
                  {" · "}
                  {allDecided ? (
                    "all decided"
                  ) : (
                    <span className="font-medium text-amber-600">
                      {decidedCount}/{doneCount} decided — decide the rest to continue
                    </span>
                  )}
                </span>
                {allDecided ? (
                  <ButtonLink href="/invoices">View all →</ButtonLink>
                ) : (
                  <button
                    type="button"
                    disabled
                    title="Record a decision on every row before continuing."
                    className="inline-flex cursor-not-allowed items-center rounded-lg bg-slate-300 px-4 py-2 text-sm font-semibold text-white"
                  >
                    View all →
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={onSubmitBatch}
                disabled={batchRunning}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
              >
                {batchRunning ? "Running AI triage…" : `Submit all ${batch.length} & run AI triage`}
              </button>
            )}
          </div>
        </Card>
      ) : (
        <Card title="Invoice details">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Invoice number <span className="text-slate-400">(optional)</span>
                </label>
                <input className={field} value={form.invoiceNumber}
                  onChange={(e) => set("invoiceNumber", e.target.value)} placeholder="auto-generated if blank" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  PO reference <span className="text-slate-400">(optional)</span>
                </label>
                <input className={field} value={form.poNumber}
                  onChange={(e) => set("poNumber", e.target.value)} placeholder="e.g. PO-2024-001" />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Vendor name</label>
              <input className={field} value={form.vendorName}
                onChange={(e) => set("vendorName", e.target.value)} placeholder="e.g. Acme Consulting Ltd" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Invoice amount (USD)</label>
              <input className={field} type="number" step="0.01" value={form.amount}
                onChange={(e) => set("amount", e.target.value)} placeholder="e.g. 45000" />
            </div>

            {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

            <button type="submit" disabled={submitting}
              className="w-full rounded-lg bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
              {submitting ? "Matching & running AI triage…" : "Submit & run AI triage"}
            </button>
          </form>
        </Card>
      )}
    </div>
  );
}

// Compact per-row decision button used in the batch results list.
function DecideButton({
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
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50 ${cls}`}
    >
      {children}
    </button>
  );
}
