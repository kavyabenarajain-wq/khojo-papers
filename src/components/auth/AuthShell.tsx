import type { ReactNode } from "react";
import { integrations } from "@/lib/env";
import { Notice } from "@/components/ui/Notice";

export function AuthShell({ title, intro, children, footer }: { title: string; intro?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="mx-auto max-w-md px-4 py-8 sm:py-14">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {intro && <div className="mt-2 text-ink-2">{intro}</div>}
      {!integrations.supabase && (
        <Notice tone="warning" className="mt-4" title="Accounts aren't available on this server yet">
          Supabase hasn&apos;t been configured. You can still browse and practise questions without an account.
        </Notice>
      )}
      <div className="mt-6 rounded-lg border border-line bg-surface p-5">{children}</div>
      {footer && <div className="mt-4 text-center text-sm text-ink-2">{footer}</div>}
    </div>
  );
}
