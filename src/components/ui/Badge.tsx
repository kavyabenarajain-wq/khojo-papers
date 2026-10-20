import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "accent" | "success" | "danger" | "warning" | "pyq" | "specimen" | "original";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2 border-line",
  accent: "bg-accent-soft text-accent-text border-transparent",
  success: "bg-success-soft text-success border-transparent",
  danger: "bg-danger-soft text-danger border-transparent",
  warning: "bg-warning-soft text-warning border-transparent",
  pyq: "bg-src-pyq-soft text-src-pyq border-transparent",
  specimen: "bg-src-specimen-soft text-src-specimen border-transparent",
  original: "bg-src-original-soft text-src-original border-line",
};

export function Badge({ tone = "neutral", children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cn("inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-xs font-medium leading-5 whitespace-nowrap", tones[tone], className)}
    >
      {children}
    </span>
  );
}
