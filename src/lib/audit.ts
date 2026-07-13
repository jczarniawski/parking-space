import { prisma } from "@/lib/db";

export type AuditAction =
  | "BOOKING_CREATED"
  | "BOOKING_CANCELLED"
  | "SPOT_RELEASED"
  | "SPOT_RECLAIMED"
  | "SPOTS_CREATED"
  | "SPOT_UPDATED"
  | "SPOT_DELETED"
  | "ROLE_CHANGED"
  | "USER_PREPROVISIONED";

export async function logAudit(entry: {
  action: AuditAction;
  actorEmail?: string | null;
  targetEmail?: string | null;
  spotNumber?: string | null;
  date?: string | null;
  details?: string | null;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        action: entry.action,
        actorEmail: entry.actorEmail ?? null,
        targetEmail: entry.targetEmail ?? null,
        spotNumber: entry.spotNumber ?? null,
        date: entry.date ?? null,
        details: entry.details ?? null,
      },
    });
  } catch (err) {
    // The audit trail must never break the main action.
    console.error("Failed to write audit log:", err);
  }
}
