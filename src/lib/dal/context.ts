import "server-only";
import { cache } from "react";
import { getDb } from "../db/client";
import { runAs } from "../db/rls";
import type { Tx } from "../db/types";
import { getViewer, type Viewer } from "../auth/session";
import { isStaff } from "../auth/rbac";
import { isPreviewMode } from "../preview";

export type DataContext = { viewer: Viewer | null; userId: string | null; preview: boolean };

export const dataContext = cache(async (): Promise<DataContext> => {
  const viewer = await getViewer();
  const usable = viewer && !viewer.needsProfile ? viewer : null;
  return {
    viewer: usable,
    userId: usable?.id ?? null,
    preview: isStaff(usable) && (await isPreviewMode()),
  };
});

/** Run as the current viewer (or anon) with RLS applied. */
export async function asViewer<T>(fn: (tx: Tx, ctx: DataContext) => Promise<T>): Promise<T> {
  const ctx = await dataContext();
  return runAs(getDb(), ctx.userId, (tx) => fn(tx, ctx));
}
