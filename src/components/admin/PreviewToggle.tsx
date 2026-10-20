"use client";

import { useTransition } from "react";
import { setPreviewAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/Button";

export function PreviewToggle({ on }: { on: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button variant={on ? "secondary" : "primary"} disabled={pending} onClick={() => start(() => setPreviewAction(!on))}>
      {on ? "Turn preview off" : "Turn preview on"}
    </Button>
  );
}
