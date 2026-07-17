"use client";

import { useEffect, useState } from "react";

/**
 * Live "As of" timestamp for the nav. Client component because it ticks;
 * rendered empty until mounted so the server and client markup never disagree
 * (avoids a hydration mismatch on the time string).
 */
export default function NavClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  if (!now) return null;

  return (
    <span className="whitespace-nowrap text-xs font-bold text-slate-800">
      As of{" "}
      {now.toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })}
    </span>
  );
}
