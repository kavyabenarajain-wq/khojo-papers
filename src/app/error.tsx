"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-ink-2">
        We couldn&apos;t load this page. Any answers you had already saved are safe. Check your connection and try again.
      </p>
      {error.digest && <p className="mt-2 font-mono text-xs text-ink-3">Reference: {error.digest}</p>}
      <div className="mt-6 flex justify-center">
        <Button onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
