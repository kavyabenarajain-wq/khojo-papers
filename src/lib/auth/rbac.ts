import "server-only";
import { redirect } from "next/navigation";
import type { Role } from "../db/schema";
import { getViewer, type Viewer } from "./session";

export const STAFF_ROLES: Role[] = ["teacher_reviewer", "content_editor", "admin"];

export function hasRole(viewer: Pick<Viewer, "roles"> | null | undefined, ...roles: Role[]): boolean {
  return Boolean(viewer && viewer.roles.some((r) => roles.includes(r)));
}
export const isStaff = (v: Pick<Viewer, "roles"> | null | undefined) => hasRole(v, ...STAFF_ROLES);
export const canEditContent = (v: Pick<Viewer, "roles"> | null | undefined) => hasRole(v, "content_editor", "admin");
export const canReviewContent = (v: Pick<Viewer, "roles"> | null | undefined) => hasRole(v, "teacher_reviewer", "admin");

/** True once a student may store attempts and uploads (adult, or guardian has consented). */
export function consentSettled(v: Pick<Viewer, "consentStatus"> | null | undefined): boolean {
  return v?.consentStatus === "not_required" || v?.consentStatus === "granted";
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403,
  ) {
    super(message);
  }
}

/** For pages: send signed-out visitors to login and back again afterwards. */
export async function requireViewer(nextPath: string): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  if (viewer.needsProfile) redirect(`/welcome?next=${encodeURIComponent(nextPath)}`);
  return viewer;
}

/** For actions and route handlers: throw instead of redirecting. */
export async function viewerOrThrow(opts: { roles?: Role[]; consent?: boolean } = {}): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer || viewer.needsProfile) throw new AuthError("Please sign in to continue.", 401);
  if (opts.roles && !hasRole(viewer, ...opts.roles)) throw new AuthError("You do not have permission to do this.", 403);
  if (opts.consent && !consentSettled(viewer)) {
    throw new AuthError("Your parent or guardian needs to confirm consent before your work can be saved.", 403);
  }
  return viewer;
}
