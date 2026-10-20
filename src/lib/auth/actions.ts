"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "../supabase/server";
import { integrations, appUrl } from "../env";
import { getDb } from "../db/client";
import { rateLimit } from "../rate-limit";
import { clientIpHash, safeNextPath } from "./request";
import { getViewer } from "./session";
import { AccountError, createProfile, issueConsentRequest } from "../dal/account";
import { sendMail } from "../mail";
import { guardianConsentEmail } from "../mail/templates";

export type FormState = { error?: string; fieldErrors?: Record<string, string>; message?: string; values?: Record<string, string> } | null;

const NOT_CONFIGURED: FormState = { error: "Accounts aren't available yet: this server hasn't been connected to Supabase." };

function fieldErrors(e: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of e.issues) {
    const k = String(i.path[0] ?? "form");
    out[k] ??= i.message;
  }
  return out;
}

const Email = z.email({ error: "Enter a valid email address." }).max(254).transform((v) => v.trim().toLowerCase());
const Password = z.string().min(8, "Use at least 8 characters.").max(128);

// ---------------------------------------------------------------------------------------------

export async function signInAction(_: FormState, form: FormData): Promise<FormState> {
  if (!integrations.supabase) return NOT_CONFIGURED;
  const parsed = z.object({ email: Email, password: z.string().min(1, "Enter your password.") }).safeParse({ email: form.get("email"), password: form.get("password") });
  const values = { email: String(form.get("email") ?? "") };
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  const ip = await clientIpHash();
  const db = getDb();
  const [byIp, byEmail] = await Promise.all([rateLimit(db, `login-ip:${ip}`, 20, 900), rateLimit(db, `login-email:${parsed.data.email}`, 8, 900)]);
  if (!byIp.ok || !byEmail.ok) return { error: "Too many sign-in attempts. Please wait 15 minutes and try again.", values };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (/confirm/i.test(error.message)) return { error: "Please confirm your email address first, using the link we sent you.", values };
    return { error: "That email and password don't match an account.", values };
  }
  redirect(safeNextPath(String(form.get("next") ?? ""), "/"));
}

const SignUp = z
  .object({
    displayName: z.string().trim().max(40, "Keep it under 40 characters.").optional(),
    email: Email,
    password: Password,
    ageBracket: z.enum(["under_18", "adult"], { error: "Tell us whether you are under 18." }),
    guardianEmail: z.string().trim().optional(),
    agree: z.literal("on", { error: "Please read and accept the privacy notice." }),
  })
  .superRefine((v, ctx) => {
    if (v.ageBracket === "under_18") {
      const g = z.email().safeParse(v.guardianEmail ?? "");
      if (!g.success) ctx.addIssue({ code: "custom", path: ["guardianEmail"], message: "Enter your parent or guardian's email address." });
      else if (g.data.toLowerCase() === v.email) ctx.addIssue({ code: "custom", path: ["guardianEmail"], message: "This must be different from your own email." });
    }
  });

export async function signUpAction(_: FormState, form: FormData): Promise<FormState> {
  if (!integrations.supabase) return NOT_CONFIGURED;
  const raw = Object.fromEntries(["displayName", "email", "password", "ageBracket", "guardianEmail", "agree"].map((k) => [k, form.get(k) ?? undefined]));
  const values = { displayName: String(raw.displayName ?? ""), email: String(raw.email ?? ""), ageBracket: String(raw.ageBracket ?? ""), guardianEmail: String(raw.guardianEmail ?? "") };
  const parsed = SignUp.safeParse(raw);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  const db = getDb();
  const limit = await rateLimit(db, `signup:${await clientIpHash()}`, 5, 3600);
  if (!limit.ok) return { error: "Too many sign-ups from this network. Please try again in an hour.", values };

  const supabase = await createSupabaseServerClient();
  const next = safeNextPath(String(form.get("next") ?? ""), "/");
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: `${appUrl()}/auth/confirm?next=${encodeURIComponent(next)}` },
  });
  if (error) {
    if (/password/i.test(error.message)) return { fieldErrors: { password: error.message }, values };
    console.error("signUp failed", error.message);
    return { error: "We couldn't create your account right now. Please try again.", values };
  }
  // Supabase returns a user with no identities when the email is already registered. We show
  // the same message either way so the form can't be used to discover who has an account.
  const isNew = Boolean(data.user && data.user.identities && data.user.identities.length > 0);
  if (isNew && data.user) {
    try {
      await createProfile(db, data.user.id, parsed.data.email, {
        displayName: parsed.data.displayName ?? null,
        ageBracket: parsed.data.ageBracket,
        guardianEmail: parsed.data.guardianEmail ?? null,
      });
    } catch (e) {
      if (e instanceof AccountError) return { error: e.message, values };
      throw e;
    }
  }
  if (data.session) redirect(next);
  return {
    message: `Check your inbox at ${parsed.data.email} for a link to confirm your email address.${parsed.data.ageBracket === "under_18" ? " After you confirm, we'll ask your parent or guardian for consent." : ""}`,
  };
}

export async function requestPasswordResetAction(_: FormState, form: FormData): Promise<FormState> {
  if (!integrations.supabase) return NOT_CONFIGURED;
  const parsed = Email.safeParse(form.get("email"));
  if (!parsed.success) return { fieldErrors: { email: "Enter a valid email address." } };
  const db = getDb();
  const [a, b] = await Promise.all([rateLimit(db, `reset-ip:${await clientIpHash()}`, 10, 3600), rateLimit(db, `reset-email:${parsed.data}`, 3, 3600)]);
  if (a.ok && b.ok) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, { redirectTo: `${appUrl()}/auth/confirm?next=/account/update-password` });
    if (error) console.error("resetPasswordForEmail failed", error.message);
  }
  // Same response whether or not the account exists.
  return { message: "If an account exists for that email, we've sent a link to reset the password. It expires soon, so use it within the hour." };
}

export async function updatePasswordAction(_: FormState, form: FormData): Promise<FormState> {
  if (!integrations.supabase) return NOT_CONFIGURED;
  const parsed = z
    .object({ password: Password, confirm: z.string() })
    .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "The passwords don't match." })
    .safeParse({ password: form.get("password"), confirm: form.get("confirm") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return { error: "Your reset link has expired. Request a new one." };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { fieldErrors: { password: error.message } };
  await supabase.auth.signOut({ scope: "others" });
  return { message: "Your password has been changed. Other devices have been signed out." };
}

export async function signOutAction() {
  if (integrations.supabase) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect("/");
}

/** For accounts that exist in Supabase Auth but have no KHOJO profile yet. */
export async function completeProfileAction(_: FormState, form: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.needsProfile) redirect("/");
  const parsed = z
    .object({
      displayName: z.string().trim().max(40).optional(),
      ageBracket: z.enum(["under_18", "adult"], { error: "Tell us whether you are under 18." }),
      guardianEmail: z.string().trim().optional(),
      agree: z.literal("on", { error: "Please read and accept the privacy notice." }),
    })
    .safeParse(Object.fromEntries(["displayName", "ageBracket", "guardianEmail", "agree"].map((k) => [k, form.get(k) ?? undefined])));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  try {
    await createProfile(getDb(), viewer.id, viewer.email, {
      displayName: parsed.data.displayName ?? null,
      ageBracket: parsed.data.ageBracket,
      guardianEmail: parsed.data.guardianEmail ?? null,
    });
  } catch (e) {
    if (e instanceof AccountError) return { fieldErrors: { guardianEmail: e.message } };
    throw e;
  }
  redirect(parsed.data.ageBracket === "under_18" ? "/account/consent" : safeNextPath(String(form.get("next") ?? ""), "/"));
}

export async function sendConsentRequestAction(_: FormState): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer || viewer.needsProfile) redirect("/login?next=/account/consent");
  try {
    const { token, guardianEmail } = await issueConsentRequest(getDb(), viewer.id);
    const mail = guardianConsentEmail({ studentName: viewer.displayName, link: `${appUrl()}/consent/${token}` });
    const sent = await sendMail({ to: guardianEmail, ...mail });
    return {
      message: sent.delivered
        ? `We've emailed ${maskEmail(guardianEmail)}. The link works for 7 days.`
        : `Email isn't configured on this development server, so the consent link was written to the server console for testing.`,
    };
  } catch (e) {
    if (e instanceof AccountError) return { error: e.message };
    if (e instanceof Error && /not configured/i.test(e.message)) return { error: "We can't send email from this server yet, so consent can't be requested. Please contact us." };
    console.error(e);
    return { error: "We couldn't send the request. Please try again later." };
  }
}

function maskEmail(e: string) {
  const [u, d] = e.split("@");
  return `${u.slice(0, 2)}${"•".repeat(Math.max(1, u.length - 2))}@${d}`;
}
