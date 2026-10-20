"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { publishPaperAction, resolveReportAction, setRolesAction, verifyTopicAction, type ActionResult } from "@/app/admin/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";

function useRun() {
  const [msg, setMsg] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return {
    msg,
    pending,
    run: (fn: () => Promise<ActionResult>) =>
      start(async () => {
        const r = await fn();
        setMsg(r);
        if (r.ok) router.refresh();
      }),
  };
}

const Msg = ({ r }: { r: ActionResult | null }) => (r ? <span className={`text-sm ${r.ok ? "text-success" : "text-danger"}`}>{r.ok ? r.message : r.error}</span> : null);

export function PaperPublishButton({ paperId, published }: { paperId: string; published: boolean }) {
  const { msg, pending, run } = useRun();
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button size="sm" variant={published ? "secondary" : "primary"} disabled={pending} onClick={() => run(() => publishPaperAction(paperId, !published))}>
        {published ? "Unpublish" : "Publish"}
      </Button>
      <Msg r={msg} />
    </span>
  );
}

export function ReportResolver({ id }: { id: string }) {
  const { msg, pending, run } = useRun();
  const [note, setNote] = useState("");
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Resolution note" aria-label="Resolution note" className="min-h-9 max-w-xs" />
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => resolveReportAction(id, "resolved", note))}>Resolved</Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => resolveReportAction(id, "dismissed", note))}>Dismiss</Button>
      <Msg r={msg} />
    </div>
  );
}

const ALL_ROLES = ["teacher_reviewer", "content_editor", "admin"] as const;

export function RolesEditor({ userId, roles }: { userId: string; roles: string[] }) {
  const { msg, pending, run } = useRun();
  const [sel, setSel] = useState(roles.filter((r) => r !== "student"));
  return (
    <div className="flex flex-wrap items-center gap-3">
      {ALL_ROLES.map((r) => (
        <label key={r} className="inline-flex min-h-9 items-center gap-1.5 text-sm">
          <input type="checkbox" checked={sel.includes(r)} onChange={(e) => setSel((s) => (e.target.checked ? [...s, r] : s.filter((x) => x !== r)))} className="accent-[var(--accent)]" />
          {r.replace("_", " ")}
        </label>
      ))}
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => setRolesAction(userId, sel))}>Save</Button>
      <Msg r={msg} />
    </div>
  );
}

export function TopicVerifier({ id, status, page }: { id: string; status: string; page: string | null }) {
  const { msg, pending, run } = useRun();
  const [p, setP] = useState(page ?? "");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input value={p} onChange={(e) => setP(e.target.value)} placeholder="Page in official PDF" aria-label="Source page" className="min-h-9 w-40" />
      <Button size="sm" variant={status === "verified" ? "secondary" : "primary"} disabled={pending || !p.trim()} onClick={() => run(() => verifyTopicAction(id, "verified", p))}>
        Verified against source
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => verifyTopicAction(id, "disputed", p))}>Doesn&apos;t match</Button>
      <Msg r={msg} />
    </div>
  );
}
