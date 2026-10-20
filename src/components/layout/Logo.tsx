import Link from "next/link";

export function LogoMark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="7" fill="var(--accent)" />
      <path d="M9 7h10l5 5v13a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" fill="var(--surface)" />
      <path d="M11.5 18.5l3 3 6-7" fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link href="/" className="flex min-h-11 items-center gap-2 rounded-md pr-1" aria-label="KHOJO PAPERS home">
      <LogoMark />
      <span className="text-[1.02rem] font-bold tracking-tight text-ink">
        KHOJO <span className="font-semibold text-ink-2">PAPERS</span>
      </span>
    </Link>
  );
}
