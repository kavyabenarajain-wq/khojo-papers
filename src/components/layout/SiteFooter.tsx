import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-ink-3">
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
          <Link className="hover:text-ink" href="/about">How we check content</Link>
          <Link className="hover:text-ink" href="/privacy">Privacy</Link>
          <Link className="hover:text-ink" href="/account/settings">Accessibility settings</Link>
        </nav>
        <p className="mt-4 max-w-2xl">
          KHOJO PAPERS is an independent study tool. It is not affiliated with, or endorsed by, the Council for the Indian
          School Certificate Examinations (CISCE). AI-estimated marks are a study aid and may differ from board marking.
        </p>
      </div>
    </footer>
  );
}
