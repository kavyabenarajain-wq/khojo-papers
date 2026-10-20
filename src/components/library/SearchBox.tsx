"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { inputClass } from "@/components/ui/Field";
import { cn } from "@/lib/cn";

export function SearchBox({ action = "/explore", placeholder = "Search questions" }: { action?: string; placeholder?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");
  const [, start] = useTransition();

  const go = (q: string) => {
    const next = new URLSearchParams(action === "/explore" ? params.toString() : "");
    next.delete("page");
    if (q.trim()) next.set("q", q.trim());
    else next.delete("q");
    start(() => router.push(`${action}${next.size ? `?${next}` : ""}`));
  };

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        go(value);
      }}
      className="relative"
    >
      <label htmlFor="library-search" className="sr-only">
        Search questions
      </label>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-3" aria-hidden />
      <input
        id="library-search"
        type="search"
        enterKeyHint="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className={cn(inputClass, "pl-10 pr-11 [&::-webkit-search-cancel-button]:hidden")}
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            setValue("");
            go("");
          }}
          className="absolute right-1 top-1/2 inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-md text-ink-3 hover:text-ink"
          aria-label="Clear search"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
    </form>
  );
}
