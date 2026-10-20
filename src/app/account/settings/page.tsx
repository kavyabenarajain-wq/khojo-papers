import type { Metadata } from "next";
import { requireViewer } from "@/lib/auth/rbac";
import { SettingsForm } from "@/components/auth/AccountForms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const v = await requireViewer("/account/settings");
  return (
    <div className="mx-auto max-w-xl px-4 py-6 sm:py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-ink-3">Your device&apos;s reduced-motion and dark-mode settings are always respected as well.</p>
      <div className="mt-6 rounded-lg border border-line bg-surface p-5">
        <SettingsForm displayName={v.displayName} prefs={v.preferences} />
      </div>
    </div>
  );
}
