"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui";

export default function PromptsPage() {
  const [content, setContent] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/prompts")
      .then((r) => r.json())
      .then((d) => {
        setContent(d.content ?? d.error ?? "");
        setName(d.name ?? "");
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Prompt library</h1>
        <p className="text-sm text-slate-500">
          Prompts are stored as files in <code className="font-mono">/prompts</code> — externalised
          from code so they can be reviewed and iterated without a redeploy. The{" "}
          <code className="font-mono">{"{{PLACEHOLDERS}}"}</code> are filled at runtime with the
          invoice data and the exception flags from the matching engine.
        </p>
      </div>

      <Card title={name || "invoice-triage.md"}>
        {loading ? (
          <p className="text-sm text-slate-500">Loading prompt…</p>
        ) : (
          <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">
            {content}
          </pre>
        )}
      </Card>
    </div>
  );
}
