import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";

type Tone = "info" | "success" | "warning" | "danger";
const styles: Record<Tone, string> = {
  info: "border-accent/25 bg-accent-soft",
  success: "border-success/25 bg-success-soft",
  warning: "border-warning/30 bg-warning-soft",
  danger: "border-danger/30 bg-danger-soft",
};
const icons = { info: Info, success: CheckCircle2, warning: AlertTriangle, danger: XCircle };
const iconColor: Record<Tone, string> = { info: "text-accent-text", success: "text-success", warning: "text-warning", danger: "text-danger" };

export function Notice({
  tone = "info",
  title,
  children,
  className,
  action,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  const Icon = icons[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-3 rounded-md border p-3.5 text-[0.95rem]", styles[tone], className)}>
      <Icon aria-hidden className={cn("mt-0.5 size-5 shrink-0", iconColor[tone])} />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold text-ink">{title}</p>}
        {children && <div className={cn("text-ink-2", title ? "mt-1" : undefined)}>{children}</div>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}
