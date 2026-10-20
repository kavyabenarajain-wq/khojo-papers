"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Native <dialog> modal: focus trapping, Escape to close and inert background come from the
 * browser. `variant="drawer"` docks to the bottom on phones and to the right on wide screens.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  variant = "modal",
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  variant?: "modal" | "drawer";
  labelledBy?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = labelledBy ?? "dialog-title";

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        "m-0 max-h-none max-w-none bg-transparent p-0 text-ink backdrop:bg-black/45",
        variant === "drawer"
          ? "fixed inset-x-0 bottom-0 top-auto w-full sm:inset-y-0 sm:left-auto sm:right-0 sm:h-full sm:w-[400px]"
          : "fixed inset-0 m-auto h-fit w-[calc(100%-2rem)] max-w-lg",
      )}
    >
      <div
        className={cn(
          "flex max-h-[88dvh] flex-col bg-surface shadow-md",
          variant === "drawer" ? "rounded-t-xl sm:h-full sm:max-h-none sm:rounded-none" : "rounded-lg",
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <button type="button" onClick={onClose} className="-mr-2 inline-flex size-11 items-center justify-center rounded-md text-ink-2 hover:bg-surface-2" aria-label="Close">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && <div className="pb-safe border-t border-line px-4 pt-3">{footer}</div>}
      </div>
    </dialog>
  );
}
