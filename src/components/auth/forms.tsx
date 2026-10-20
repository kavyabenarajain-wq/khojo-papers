"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  completeProfileAction,
  requestPasswordResetAction,
  sendConsentRequestAction,
  signInAction,
  signUpAction,
  updatePasswordAction,
  type FormState,
} from "@/lib/auth/actions";
import { Button } from "@/components/ui/Button";
import { Checkbox, Field, Input } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { Spinner } from "@/components/ui/Spinner";

function Submit({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending && <Spinner label="Working" />}
      {children}
    </Button>
  );
}

function FormError({ state }: { state: FormState }) {
  if (!state?.error) return null;
  return <Notice tone="danger">{state.error}</Notice>;
}

const fe = (state: FormState, k: string) => state?.fieldErrors?.[k];
const aria = (state: FormState, k: string) => (fe(state, k) ? { "aria-invalid": true as const, "aria-describedby": `${k}-error` } : {});

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signInAction, null);
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <FormError state={state} />
      <Field label="Email" htmlFor="email" error={fe(state, "email")}>
        <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required defaultValue={state?.values?.email} {...aria(state, "email")} />
      </Field>
      <Field label="Password" htmlFor="password" error={fe(state, "password")}>
        <Input id="password" name="password" type="password" autoComplete="current-password" required {...aria(state, "password")} />
      </Field>
      <div className="text-right text-sm">
        <Link href="/forgot-password" className="font-medium text-accent-text hover:underline">Forgot password?</Link>
      </div>
      <Submit pending={pending}>Sign in</Submit>
    </form>
  );
}

export function AgeAndGuardianFields({ state, defaultAge }: { state: FormState; defaultAge?: string }) {
  const [age, setAge] = useState(defaultAge ?? "");
  return (
    <>
      <fieldset aria-describedby={fe(state, "ageBracket") ? "ageBracket-error" : undefined}>
        <legend className="mb-1.5 text-sm font-medium text-ink">How old are you?</legend>
        <div className="grid grid-cols-2 gap-2">
          {[
            ["under_18", "Under 18"],
            ["adult", "18 or older"],
          ].map(([v, l]) => (
            <label key={v} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 ${age === v ? "border-accent bg-accent-soft" : "border-line-strong"}`}>
              <input type="radio" name="ageBracket" value={v} checked={age === v} onChange={() => setAge(v)} className="accent-[var(--accent)]" />
              {l}
            </label>
          ))}
        </div>
        {fe(state, "ageBracket") && <p id="ageBracket-error" role="alert" className="mt-1.5 text-sm font-medium text-danger">{fe(state, "ageBracket")}</p>}
      </fieldset>
      {age === "under_18" && (
        <div className="rounded-md bg-surface-2 p-3">
          <Field
            label="Parent or guardian's email"
            htmlFor="guardianEmail"
            error={fe(state, "guardianEmail")}
            help="Because you're under 18, we'll ask them to agree before your answers are saved. You can still practise in the meantime."
          >
            <Input id="guardianEmail" name="guardianEmail" type="email" inputMode="email" autoComplete="off" defaultValue={state?.values?.guardianEmail} {...aria(state, "guardianEmail")} />
          </Field>
        </div>
      )}
    </>
  );
}

function PrivacyAgree({ state }: { state: FormState }) {
  return (
    <div>
      <Checkbox
        name="agree"
        label={
          <>
            I have read the <Link href="/privacy" target="_blank" className="font-medium text-accent-text underline">privacy notice</Link>, including how the AI Examiner processes answers.
          </>
        }
      />
      {fe(state, "agree") && <p role="alert" className="text-sm font-medium text-danger">{fe(state, "agree")}</p>}
    </div>
  );
}

export function SignUpForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signUpAction, null);
  if (state?.message) return <Notice tone="success" title="Check your email">{state.message}</Notice>;
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <FormError state={state} />
      <Field label="First name or nickname (optional)" htmlFor="displayName" error={fe(state, "displayName")} help="Shown only to you. No surname needed.">
        <Input id="displayName" name="displayName" autoComplete="nickname" maxLength={40} defaultValue={state?.values?.displayName} />
      </Field>
      <Field label="Email" htmlFor="email" error={fe(state, "email")}>
        <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" defaultValue={state?.values?.email} {...aria(state, "email")} />
      </Field>
      <Field label="Password" htmlFor="password" error={fe(state, "password")} help="At least 8 characters.">
        <Input id="password" name="password" type="password" autoComplete="new-password" {...aria(state, "password")} />
      </Field>
      <AgeAndGuardianFields state={state} defaultAge={state?.values?.ageBracket} />
      <PrivacyAgree state={state} />
      <Submit pending={pending}>Create account</Submit>
    </form>
  );
}

export function WelcomeForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(completeProfileAction, null);
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <FormError state={state} />
      <Field label="First name or nickname (optional)" htmlFor="displayName">
        <Input id="displayName" name="displayName" maxLength={40} />
      </Field>
      <AgeAndGuardianFields state={state} />
      <PrivacyAgree state={state} />
      <Submit pending={pending}>Continue</Submit>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordResetAction, null);
  if (state?.message) return <Notice tone="success">{state.message}</Notice>;
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError state={state} />
      <Field label="Email" htmlFor="email" error={fe(state, "email")}>
        <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" {...aria(state, "email")} />
      </Field>
      <Submit pending={pending}>Send reset link</Submit>
    </form>
  );
}

export function UpdatePasswordForm() {
  const [state, action, pending] = useActionState(updatePasswordAction, null);
  if (state?.message) return <Notice tone="success" action={<Link href="/" className="font-medium underline">Continue</Link>}>{state.message}</Notice>;
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError state={state} />
      <Field label="New password" htmlFor="password" error={fe(state, "password")} help="At least 8 characters.">
        <Input id="password" name="password" type="password" autoComplete="new-password" {...aria(state, "password")} />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm" error={fe(state, "confirm")}>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" {...aria(state, "confirm")} />
      </Field>
      <Submit pending={pending}>Change password</Submit>
    </form>
  );
}

export function SendConsentRequest({ alreadySent }: { alreadySent: boolean }) {
  const [state, action, pending] = useActionState(sendConsentRequestAction, null);
  return (
    <form action={action} className="space-y-3">
      {state?.message && <Notice tone="success">{state.message}</Notice>}
      <FormError state={state} />
      <Button type="submit" disabled={pending}>
        {pending && <Spinner label="Sending" />}
        {alreadySent ? "Send the request again" : "Send consent request"}
      </Button>
    </form>
  );
}
