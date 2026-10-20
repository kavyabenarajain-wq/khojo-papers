import { ButtonLink } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="mt-2 text-ink-2">This page doesn&apos;t exist, or the question has been unpublished while it&apos;s being corrected.</p>
      <div className="mt-6 flex justify-center gap-2">
        <ButtonLink href="/explore">Explore questions</ButtonLink>
        <ButtonLink href="/" variant="secondary">Home</ButtonLink>
      </div>
    </div>
  );
}
