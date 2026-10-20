import type { ReactNode } from "react";

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line-strong bg-surface px-5 py-10 text-center">
      {icon && <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-surface-2 text-ink-3">{icon}</div>}
      <p className="font-semibold text-ink">{title}</p>
      {children && <div className="mx-auto mt-1.5 max-w-md text-[0.95rem] text-ink-2">{children}</div>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
