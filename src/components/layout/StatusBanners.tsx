import Link from "next/link";
import { integrations } from "@/lib/env";
import { getViewer } from "@/lib/auth/session";
import { isStaff } from "@/lib/auth/rbac";
import { isPreviewMode } from "@/lib/preview";

/** Honest, site-wide states: missing configuration, pending guardian consent, staff preview. */
export async function StatusBanners() {
  const viewer = await getViewer();
  const preview = isStaff(viewer) && (await isPreviewMode());
  const banners: React.ReactNode[] = [];

  if (!integrations.supabase || !integrations.database) {
    banners.push(
      <Banner key="setup" tone="warning">
        Setup needed: Supabase is not configured, so sign-in and saved content are unavailable. See the README for the
        variables to add to <code className="font-mono">.env.local</code>.
      </Banner>,
    );
  }
  if (viewer?.consentStatus === "pending") {
    banners.push(
      <Banner key="consent" tone="warning">
        Your parent or guardian has not confirmed consent yet, so your answers can&apos;t be saved.{" "}
        <Link className="font-semibold underline underline-offset-2" href="/account/consent">
          Check consent status
        </Link>
      </Banner>,
    );
  }
  if (preview) {
    banners.push(
      <Banner key="preview" tone="info">
        Staff preview: unpublished and unreviewed content is visible. Students cannot see it.{" "}
        <Link className="font-semibold underline underline-offset-2" href="/admin/preview">
          Turn off
        </Link>
      </Banner>,
    );
  }
  if (!banners.length) return null;
  return <div className="border-b border-line">{banners}</div>;
}

function Banner({ tone, children }: { tone: "warning" | "info"; children: React.ReactNode }) {
  return (
    <div role="status" className={tone === "warning" ? "bg-warning-soft" : "bg-accent-soft"}>
      <p className="mx-auto max-w-6xl px-4 py-2.5 text-sm text-ink">{children}</p>
    </div>
  );
}
