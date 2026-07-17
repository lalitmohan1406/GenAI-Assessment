import Link from "next/link";

/** Small shared presentational helpers used across the invoice screens. */

export const money = (n: number) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

// A recommendation/decision chip in Finance-friendly colours.
export function DecisionBadge({ value }: { value?: string | null }) {
  if (!value) return <span className="text-slate-400">—</span>;
  const map: Record<string, string> = {
    approve: "bg-emerald-100 text-emerald-800 ring-emerald-600/20",
    approved: "bg-emerald-100 text-emerald-800 ring-emerald-600/20",
    escalate: "bg-amber-100 text-amber-800 ring-amber-600/20",
    escalated: "bg-amber-100 text-amber-800 ring-amber-600/20",
    reject: "bg-rose-100 text-rose-800 ring-rose-600/20",
    rejected: "bg-rose-100 text-rose-800 ring-rose-600/20",
    pending: "bg-slate-100 text-slate-700 ring-slate-500/20",
  };
  const cls = map[value] ?? "bg-slate-100 text-slate-700 ring-slate-500/20";
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold capitalize ring-1 ring-inset ${cls}`}
    >
      {value}
    </span>
  );
}

export function SeverityDot({ severity }: { severity: string }) {
  const c =
    severity === "high" ? "bg-rose-500" : severity === "medium" ? "bg-amber-500" : "bg-sky-500";
  return <span className={`inline-block h-2 w-2 rounded-full ${c}`} />;
}

export function Card({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {title && (
        <div className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-700">
          {title}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "warn" | "good";
}) {
  const valueTone =
    tone === "warn" ? "text-amber-600" : tone === "good" ? "text-emerald-600" : "text-slate-900";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-3xl font-bold ${valueTone}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

export function ButtonLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
    >
      {children}
    </Link>
  );
}
