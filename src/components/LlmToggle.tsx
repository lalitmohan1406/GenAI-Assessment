"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Header switch to disable/enable the LLM at runtime so the rules-based
 * fallback can be demonstrated live. State is held server-side (see
 * /api/settings/llm) and shared by every triage.
 */
export default function LlmToggle() {
  const router = useRouter();
  const [disabled, setDisabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/settings/llm")
      .then((r) => r.json())
      .then((d) => setDisabled(Boolean(d.llmDisabled)))
      .catch(() => setDisabled(false));
  }, []);

  async function toggle() {
    if (disabled === null || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/settings/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ llmDisabled: !disabled }),
      });
      const data = await res.json();
      setDisabled(Boolean(data.llmDisabled));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const on = disabled === false;
  const label = disabled === null ? "AI Assist: …" : on ? "AI Assist: On" : "AI Assist: Off · fallback";

  return (
    <button
      onClick={toggle}
      disabled={disabled === null || busy}
      title="Disable AI Assist to demo the rules-based fallback"
      className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-sm font-medium transition disabled:opacity-60 ${
        on
          ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          : "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
      }`}
    >
      <span
        className={`mr-2 inline-block h-2 w-2 rounded-full ${on ? "bg-emerald-500" : "bg-amber-500"}`}
      />
      {label}
    </button>
  );
}
