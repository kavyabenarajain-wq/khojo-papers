"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const ITEMS = [
  { href: "/admin", label: "Overview", roles: null },
  { href: "/admin/review", label: "Review queue", roles: null },
  { href: "/admin/questions", label: "Questions", roles: null },
  { href: "/admin/papers", label: "Papers", roles: null },
  { href: "/admin/generate", label: "Draft with AI", roles: ["content_editor", "admin"] },
  { href: "/admin/sources", label: "Sources & import", roles: null },
  { href: "/admin/syllabus", label: "Syllabus", roles: null },
  { href: "/admin/disagreements", label: "Teacher reviews", roles: ["teacher_reviewer", "admin"] },
  { href: "/admin/benchmarks", label: "Benchmarks", roles: null },
  { href: "/admin/reports", label: "Issue reports", roles: null },
  { href: "/admin/audit", label: "Audit log", roles: ["admin"] },
  { href: "/admin/users", label: "Users & roles", roles: ["admin"] },
] as const;

export function AdminNav({ roles }: { roles: string[] }) {
  const pathname = usePathname();
  const items = ITEMS.filter((i) => !i.roles || i.roles.some((r) => roles.includes(r)));
  return (
    <nav aria-label="Admin" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
      <ul className="flex gap-1 lg:flex-col">
        {items.map((i) => {
          const active = i.href === "/admin" ? pathname === "/admin" : pathname.startsWith(i.href);
          return (
            <li key={i.href} className="shrink-0">
              <Link
                href={i.href}
                aria-current={active ? "page" : undefined}
                className={cn("flex min-h-10 items-center rounded-md px-3 text-sm font-medium", active ? "bg-surface-2 text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink")}
              >
                {i.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
