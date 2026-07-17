/**
 * Demo control: a process-global switch that forces the deterministic
 * rules-based fallback even when a valid ANTHROPIC_API_KEY is configured. Lets
 * the fallback path be demonstrated live without editing .env or removing the
 * key. Held on globalThis so it is shared across route modules and survives dev
 * hot-reloads (same pattern as the Prisma client singleton).
 */
const store = globalThis as unknown as { __llmDisabled?: boolean };

export function isLlmDisabled(): boolean {
  return store.__llmDisabled ?? false;
}

export function setLlmDisabled(disabled: boolean): void {
  store.__llmDisabled = disabled;
}
