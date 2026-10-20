/* Script logic lives here (CommonJS-transpiled) so table imports resolve normally. */
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";
import type { Db } from "../src/lib/db/types";
import { runAs } from "../src/lib/db/rls";
import { decideRevision, publishPaper, publishQuestion } from "../src/lib/dal/review";
import { audit } from "../src/lib/audit";

export { schema };

/** LOCAL TESTING ONLY: approve and publish everything as a clearly-named fake reviewer. */
export async function fakeReviewEverything(db: Db, insertAuthUser: (id: string) => Promise<void>) {
  const NAME = "Local test reviewer (not a teacher)";
  let [rev] = await db.select().from(schema.profiles).where(eq(schema.profiles.displayName, NAME));
  if (!rev) {
    const id = randomUUID();
    await insertAuthUser(id);
    [rev] = await db.insert(schema.profiles).values({ id, displayName: NAME, roles: ["teacher_reviewer"], ageBracket: "adult", consentStatus: "not_required" }).returning();
  }
  const actor = { id: rev.id, roles: rev.roles };
  for (const [kind, table] of [["question", schema.questionRevisions], ["solution", schema.solutionRevisions], ["rubric", schema.rubricRevisions]] as const) {
    for (const r of await db.select({ id: table.id }).from(table).where(eq(table.status, "in_review"))) {
      await runAs(db, rev.id, (tx) => decideRevision(tx, actor, kind, r.id, "approved", "Local fake review for UI testing"));
    }
  }
  for (const q of await db.select().from(schema.questions).where(eq(schema.questions.publicationStatus, "draft"))) {
    await runAs(db, rev.id, (tx) => publishQuestion(tx, actor, q.id));
  }
  for (const p of await db.select().from(schema.papers).where(eq(schema.papers.publicationStatus, "draft"))) {
    await runAs(db, rev.id, (tx) => publishPaper(tx, actor, p.id)).catch((e: Error) => console.warn(`Paper ${p.slug}: ${e.message}`));
  }
}

export async function setRolesByEmail(db: Db, email: string, roles: string[]): Promise<{ ok: true; roles: string[] } | { ok: false; error: string }> {
  if (!roles.length || roles.some((r) => !(schema.ROLES as readonly string[]).includes(r))) {
    return { ok: false, error: `Roles must be from: ${schema.ROLES.join(", ")}` };
  }
  const res = (await db.execute(sql`select id from auth.users where lower(email) = lower(${email}) limit 1`)) as unknown;
  const list = (Array.isArray(res) ? res : (res as { rows: unknown[] }).rows) as { id: string }[];
  const id = list[0]?.id;
  if (!id) return { ok: false, error: `No account found for ${email}. Sign up in the app first.` };
  const updated = await db
    .update(schema.profiles)
    .set({ roles: Array.from(new Set(["student", ...roles])), updatedAt: new Date() })
    .where(eq(schema.profiles.id, id))
    .returning();
  if (!updated.length) return { ok: false, error: "That account has no profile yet. Sign in once and complete the welcome step, then retry." };
  await audit(db, { actorId: null, action: "roles.changed_cli", entityType: "profile", entityId: id, details: { roles: updated[0].roles } });
  return { ok: true, roles: updated[0].roles };
}
