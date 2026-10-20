"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { runAs } from "@/lib/db/rls";
import { profiles } from "@/lib/db/schema";
import { getViewer } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { deleteAccountCompletely } from "@/lib/account-deletion";
import { rateLimit } from "@/lib/rate-limit";
import type { FormState } from "@/lib/auth/actions";

export async function updateSettingsAction(_: FormState, form: FormData): Promise<FormState> {
  const v = await getViewer();
  if (!v || v.needsProfile) redirect("/login?next=/account/settings");
  const parsed = z
    .object({
      displayName: z.string().trim().max(40, "Keep it under 40 characters."),
      textSize: z.enum(["default", "large", "larger"]),
      reducedMotion: z.enum(["on"]).optional(),
      highContrast: z.enum(["on"]).optional(),
    })
    .safeParse({
      displayName: form.get("displayName") ?? "",
      textSize: form.get("textSize") ?? "default",
      reducedMotion: form.get("reducedMotion") ?? undefined,
      highContrast: form.get("highContrast") ?? undefined,
    });
  if (!parsed.success) return { fieldErrors: { displayName: parsed.error.issues[0].message } };
  await runAs(getDb(), v.id, (tx) =>
    tx
      .update(profiles)
      .set({
        displayName: parsed.data.displayName || null,
        preferences: { textSize: parsed.data.textSize, reducedMotion: Boolean(parsed.data.reducedMotion), highContrast: Boolean(parsed.data.highContrast) },
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, v.id)),
  );
  revalidatePath("/", "layout");
  return { message: "Settings saved." };
}

export async function deleteMyAccountAction(_: FormState, form: FormData): Promise<FormState> {
  const v = await getViewer();
  if (!v) redirect("/login?next=/account/privacy");
  if (String(form.get("confirm") ?? "").trim().toUpperCase() !== "DELETE") return { fieldErrors: { confirm: "Type DELETE to confirm." } };
  const limit = await rateLimit(getDb(), `delete:${v.id}`, 5, 3600);
  if (!limit.ok) return { error: "Too many attempts. Please try again later." };
  // Re-check the password so a borrowed, signed-in device can't delete the account.
  const supabase = await createSupabaseServerClient();
  const { error: authError } = await supabase.auth.signInWithPassword({ email: v.email ?? "", password: String(form.get("password") ?? "") });
  if (authError) return { fieldErrors: { password: "That password isn't right." } };
  try {
    await deleteAccountCompletely(v.id, "user_request");
  } catch (e) {
    console.error(e);
    return { error: "We couldn't finish deleting your account. Nothing has been lost; please try again, or contact us." };
  }
  await supabase.auth.signOut().catch(() => undefined);
  redirect("/?deleted=1");
}
