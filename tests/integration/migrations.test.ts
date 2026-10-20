import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb, createUser, expectDbError, type TestDb } from "../helpers/db";
import { runAs } from "@/lib/db/rls";
import * as s from "@/lib/db/schema";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => t.close());

describe("migrations", () => {
  it("apply cleanly and enable RLS on every app table", async () => {
    const res = await t.pg.query<{ tablename: string; rowsecurity: boolean }>(
      "select tablename, rowsecurity from pg_tables where schemaname = 'app'",
    );
    expect(res.rows.length).toBeGreaterThan(25);
    expect(res.rows.filter((r) => !r.rowsecurity)).toEqual([]);
  });

  it("anon can read subjects but not profiles", async () => {
    const u = await createUser(t);
    await t.db.insert(s.subjects).values({ slug: "maths", name: "Mathematics", classLevel: 10, syllabusYear: "2027", status: "active" });
    const subjects = await runAs(t.db, null, (tx) => tx.select().from(s.subjects));
    expect(subjects.length).toBe(1);
    const profiles = await runAs(t.db, null, (tx) => tx.select().from(s.profiles));
    expect(profiles).toEqual([]);
    const own = await runAs(t.db, u, (tx) => tx.select().from(s.profiles));
    expect(own.map((p) => p.id)).toEqual([u]);
  });

  it("students cannot change their own roles", async () => {
    const u = await createUser(t);
    await expectDbError(
      runAs(t.db, u, (tx) => tx.execute(sql`update app.profiles set roles = '{admin}' where id = ${u}`)),
      /permission denied/,
    );
    await expectDbError(
      runAs(t.db, u, (tx) => tx.execute(sql`select app.set_roles(${u}::uuid, '{admin}')`)),
      /Only administrators/,
    );
  });
});
