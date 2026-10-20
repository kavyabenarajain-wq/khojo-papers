import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export const inputClass =
  "block w-full min-h-11 rounded-md border border-line-strong bg-surface px-3 py-2 text-base text-ink " +
  "placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 " +
  "disabled:bg-surface-2 disabled:text-ink-3 aria-[invalid=true]:border-danger";

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("mb-1.5 block text-sm font-medium text-ink", className)} {...props} />;
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(inputClass, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(inputClass, "min-h-28 leading-relaxed", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(inputClass, "appearance-auto pr-8", className)} {...props} />;
}

export function Help({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-1.5 text-sm text-ink-3">
      {children}
    </p>
  );
}

export function FieldError({ id, children }: { id?: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-sm font-medium text-danger">
      {children}
    </p>
  );
}

export function Field({
  label,
  htmlFor,
  help,
  error,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor: string;
  help?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {help && !error && <Help id={`${htmlFor}-help`}>{help}</Help>}
      <FieldError id={`${htmlFor}-error`}>{error}</FieldError>
    </div>
  );
}

export function Checkbox({ label, className, ...props }: ComponentProps<"input"> & { label: ReactNode }) {
  return (
    <label className={cn("flex min-h-11 cursor-pointer items-start gap-3 py-2 text-[0.95rem] text-ink", className)}>
      <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]" {...props} />
      <span>{label}</span>
    </label>
  );
}
