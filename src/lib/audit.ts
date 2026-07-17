import { prisma } from "./prisma";

/**
 * Append an immutable audit record. Every AI decision and human override goes
 * through here so override rate and resolution time are measurable — "if you
 * cannot measure override rate, you cannot improve the model" (assessment 6.2).
 */
export async function writeAudit(entry: {
  userId?: number | null;
  entityType: string;
  entityId: number;
  action: string; // "create" | "ai_triage" | "human_override"
  oldValue?: unknown;
  newValue?: unknown;
}) {
  await prisma.auditLog.create({
    data: {
      userId: entry.userId ?? null,
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      oldValue: entry.oldValue === undefined ? null : JSON.stringify(entry.oldValue),
      newValue: entry.newValue === undefined ? null : JSON.stringify(entry.newValue),
    },
  });
}
