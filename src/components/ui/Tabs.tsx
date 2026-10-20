"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type TabItem = { id: string; label: ReactNode; content: ReactNode };

/** WAI-ARIA tabs with arrow-key navigation. Panels stay mounted so form state is kept. */
export function Tabs({ items, initial, onChange, className }: { items: TabItem[]; initial?: string; onChange?: (id: string) => void; className?: string }) {
  const [active, setActive] = useState(initial ?? items[0]?.id);
  const base = useId();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const select = (id: string) => {
    setActive(id);
    onChange?.(id);
  };

  const onKey = (e: KeyboardEvent, index: number) => {
    let next = index;
    if (e.key === "ArrowRight") next = (index + 1) % items.length;
    else if (e.key === "ArrowLeft") next = (index - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    else return;
    e.preventDefault();
    const id = items[next].id;
    select(id);
    refs.current[id]?.focus();
  };

  return (
    <div className={className}>
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line">
        {items.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el;
            }}
            role="tab"
            id={`${base}-tab-${t.id}`}
            aria-selected={active === t.id}
            aria-controls={`${base}-panel-${t.id}`}
            tabIndex={active === t.id ? 0 : -1}
            onClick={() => select(t.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "-mb-px min-h-11 shrink-0 border-b-2 px-3 text-[0.95rem] font-medium transition-colors",
              active === t.id ? "border-accent text-ink" : "border-transparent text-ink-3 hover:text-ink",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {items.map((t) => (
        <div key={t.id} role="tabpanel" id={`${base}-panel-${t.id}`} aria-labelledby={`${base}-tab-${t.id}`} hidden={active !== t.id} className="pt-4">
          {t.content}
        </div>
      ))}
    </div>
  );
}
