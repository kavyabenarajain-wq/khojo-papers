import { auditLog } from "./db/schema";
import type { Executor } from "./db/types";

export async function audit(
  db: Executor,
  entry: { actorId: string | null; action: string; entityType: string; entityId?: string | null; details?: Record<string, unknown> },
): Promise<void> {
  await db.insert(auditLog).values({
    actorId: entry.actorId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    details: entry.details ?? {},
  });
}
