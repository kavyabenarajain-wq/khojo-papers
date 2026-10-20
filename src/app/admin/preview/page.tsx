import type { Metadata } from "next";
import { isPreviewMode } from "@/lib/preview";
import { PreviewToggle } from "@/components/admin/PreviewToggle";

export const metadata: Metadata = { title: "Student preview" };

export default async function PreviewPage() {
  const on = await isPreviewMode();
  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold tracking-tight">Student preview</h1>
      <p className="mt-2 text-ink-2">
        Preview shows unpublished and unreviewed questions in the student views (Explore, question pages, papers) so you can check how they look. Only you
        see them, with a banner. Answers can&apos;t be saved on unpublished questions.
      </p>
      <div className="mt-4"><PreviewToggle on={on} /></div>
    </div>
  );
}
