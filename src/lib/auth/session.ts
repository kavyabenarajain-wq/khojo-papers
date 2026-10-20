import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { integrations } from "../env";
import { createSupabaseServerClient } from "../supabase/server";
import { getDb } from "../db/client";
import { profiles, type Role, type UserPreferences } from "../db/schema";

export type Viewer = {
  id: string;
  email: string | null;
  displayName: string | null;
  roles: Role[];
  ageBracket: "under_18" | "adult" | null;
  consentStatus: "not_required" | "pending" | "granted" | "withdrawn" | null;
  guardianEmail: string | null;
  consentRequestedAt: Date | null;
  preferences: UserPreferences;
  /** Signed in with Supabase but no KHOJO profile yet (e.g. account created in the dashboard). */
  needsProfile: boolean;
};

/**
 * The signed-in user, verified from the Supabase JWT (getClaims validates the signature), plus
 * their profile. Cached for the duration of one request.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  if (!integrations.supabase || !integrations.database) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (error || !sub) return null;
  const email = typeof data.claims.email === "string" ? data.claims.email : null;

  const [profile] = await getDb().select().from(profiles).where(eq(profiles.id, sub)).limit(1);
  if (!profile) {
    return {
      id: sub,
      email,
      displayName: null,
      roles: ["student"],
      ageBracket: null,
      consentStatus: null,
      guardianEmail: null,
      consentRequestedAt: null,
      preferences: {},
      needsProfile: true,
    };
  }
  return {
    id: sub,
    email,
    displayName: profile.displayName,
    roles: profile.roles as Role[],
    ageBracket: profile.ageBracket,
    consentStatus: profile.consentStatus,
    guardianEmail: profile.guardianEmail,
    consentRequestedAt: profile.consentRequestedAt,
    preferences: profile.preferences ?? {},
    needsProfile: false,
  };
});
