"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, FileText, Home, PenLine, Search } from "lucide-react";
import { NAV_ITEMS } from "./nav-items";
import { cn } from "@/lib/cn";

const ICONS = { home: Home, search: Search, papers: FileText, examiner: PenLine, progress: BarChart3 };

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`) || (href === "/explore" && pathname.startsWith("/questions"));
}

export function DesktopNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-10 items-center rounded-md px-3 text-[0.95rem] font-medium transition-colors",
              active ? "bg-surface-2 text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Bottom tab bar on phones. Hidden while taking a timed paper so it can't be tapped by mistake. */
export function MobileTabBar() {
  const pathname = usePathname();
  if (/^\/papers\/[^/]+\/attempt\//.test(pathname) || pathname.startsWith("/admin")) return null;
  return (
    <nav aria-label="Main" className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur md:hidden">
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {NAV_ITEMS.map((item) => {
          const Icon = ICONS[item.icon];
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[0.72rem] font-medium",
                  active ? "text-accent-text" : "text-ink-3",
                )}
              >
                <Icon className="size-5" aria-hidden strokeWidth={active ? 2.4 : 2} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
