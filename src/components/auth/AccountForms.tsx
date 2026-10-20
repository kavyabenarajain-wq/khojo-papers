"use client";

import { useActionState } from "react";
import { deleteMyAccountAction, updateSettingsAction } from "@/app/account/actions";
import type { UserPreferences } from "@/lib/db/schema";
import { Button } from "@/components/ui/Button";
import { Checkbox, Field, Input, Select } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { Spinner } from "@/components/ui/Spinner";

export function SettingsForm({ displayName, prefs }: { displayName: string | null; prefs: UserPreferences }) {
  const [state, action, pending] = useActionState(updateSettingsAction, null);
  return (
    <form action={action} className="space-y-5">
      {state?.message && <Notice tone="success">{state.message}</Notice>}
      <Field label="First name or nickname" htmlFor="displayName" error={state?.fieldErrors?.displayName} help="Only you see this.">
        <Input id="displayName" name="displayName" defaultValue={displayName ?? ""} maxLength={40} />
      </Field>
      <fieldset className="space-y-2">
        <legend className="mb-1 font-semibold">Accessibility</legend>
        <Field label="Text size" htmlFor="textSize">
          <Select id="textSize" name="textSize" defaultValue={prefs.textSize ?? "default"}>
            <option value="default">Standard</option>
            <option value="large">Large</option>
            <option value="larger">Larger</option>
          </Select>
        </Field>
        <Checkbox name="reducedMotion" defaultChecked={prefs.reducedMotion} label="Reduce motion (no whiteboard writing animation)" />
        <Checkbox name="highContrast" defaultChecked={prefs.highContrast} label="Higher contrast text and borders" />
      </fieldset>
      <Button type="submit" disabled={pending}>
        {pending && <Spinner label="Saving" />}Save settings
      </Button>
    </form>
  );
}

export function DeleteAccountForm() {
  const [state, action, pending] = useActionState(deleteMyAccountAction, null);
  return (
    <form action={action} className="space-y-4">
      {state?.error && <Notice tone="danger">{state.error}</Notice>}
      <Field label="Your password" htmlFor="password" error={state?.fieldErrors?.password}>
        <Input id="password" name="password" type="password" autoComplete="current-password" />
      </Field>
      <Field label="Type DELETE to confirm" htmlFor="confirm" error={state?.fieldErrors?.confirm}>
        <Input id="confirm" name="confirm" autoComplete="off" autoCapitalize="characters" />
      </Field>
      <Button type="submit" variant="danger" disabled={pending}>
        {pending && <Spinner label="Deleting" />}Delete my account permanently
      </Button>
    </form>
  );
}
