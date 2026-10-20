import Link from "next/link";
import { ShieldCheck, UserRound } from "lucide-react";
import { getViewer } from "@/lib/auth/session";
import { isStaff } from "@/lib/auth/rbac";
import { Logo } from "./Logo";
import { DesktopNav } from "./NavLinks";
import { buttonClass } from "@/components/ui/Button";

export async function SiteHeader() {
  const viewer = await getViewer();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
        <div className="flex items-center gap-6">
          <Logo />
          <DesktopNav />
        </div>
        <div className="flex items-center gap-1">
          {isStaff(viewer) && (
            <Link href="/admin" className={buttonClass("ghost", "sm", "gap-1.5")}>
              <ShieldCheck className="size-4" aria-hidden />
              <span className="hidden sm:inline">Admin</span>
              <span className="sr-only sm:hidden">Admin</span>
            </Link>
          )}
          {viewer ? (
            <Link href="/account" className={buttonClass("ghost", "sm", "gap-1.5")} aria-label="Your account">
              <UserRound className="size-4" aria-hidden />
              <span className="hidden max-w-32 truncate sm:inline">{viewer.displayName || "Account"}</span>
            </Link>
          ) : (
            <Link href="/login" className={buttonClass("secondary", "sm")}>
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
