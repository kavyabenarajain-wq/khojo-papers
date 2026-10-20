"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createFromCandidateAction, discardCandidateAction, updateSourceAction, type ActionResult } from "@/app/admin/actions";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { Spinner } from "@/components/ui/Spinner";

export function SourceUploadForm() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setMsg(null);
        try {
          const res = await fetch("/api/admin/sources", { method: "POST", body: new FormData(e.currentTarget) });
          const body = await res.json();
          if (!res.ok) setMsg({ ok: false, text: body.error ?? "Upload failed." });
          else router.push(body.jobId ? `/admin/ingestion/${body.jobId}` : `/admin/sources/${body.id}`);
        } catch {
          setMsg({ ok: false, text: "The upload was interrupted." });
        } finally {
          setPending(false);
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" htmlFor="title"><Input id="title" name="title" required /></Field>
        <Field label="Document type" htmlFor="documentType">
          <Select id="documentType" name="documentType">
            <option value="board_paper">Board examination paper</option>
            <option value="specimen_paper">Specimen paper</option>
            <option value="syllabus">Syllabus</option>
            <option value="regulations">Regulations</option>
            <option value="textbook">Textbook</option>
            <option value="other">Other</option>
          </Select>
        </Field>
        <Field label="Class" htmlFor="classLevel"><Input id="classLevel" name="classLevel" inputMode="numeric" defaultValue="10" /></Field>
        <Field label="Examination year" htmlFor="examinationYear"><Input id="examinationYear" name="examinationYear" inputMode="numeric" /></Field>
        <Field label="Syllabus year" htmlFor="syllabusYear"><Input id="syllabusYear" name="syllabusYear" /></Field>
        <Field label="Retrieval date" htmlFor="retrievalDate"><Input id="retrievalDate" name="retrievalDate" type="date" /></Field>
        <Field label="Official source URL" htmlFor="sourceUrl" className="sm:col-span-2"><Input id="sourceUrl" name="sourceUrl" type="url" placeholder="https://cisce.org/…" /></Field>
        <Field label="Publication rights" htmlFor="permissionStatus" help="A copy is stored and imported only if licensed or our own.">
          <Select id="permissionStatus" name="permissionStatus" defaultValue="unknown">
            <option value="unknown">Unknown</option>
            <option value="reference_only">Reference only (link, don&apos;t host)</option>
            <option value="licensed">Licensed</option>
            <option value="own_content">Our own content</option>
            <option value="restricted">Restricted</option>
          </Select>
        </Field>
        <Field label="Rights evidence / notes" htmlFor="permissionNotes"><Input id="permissionNotes" name="permissionNotes" /></Field>
      </div>
      <Field label="Known limitations" htmlFor="knownLimitations"><Textarea id="knownLimitations" name="knownLimitations" rows={2} /></Field>
      <Field label="PDF (optional)" htmlFor="file" help="Up to 40 MB and 60 pages. Text is extracted; scanned pages use OCR when the AI service is configured.">
        <Input id="file" name="file" type="file" accept="application/pdf" />
      </Field>
      <Button type="submit" disabled={pending}>{pending && <Spinner label="Uploading" />}Add source document</Button>
      {msg && <Notice tone={msg.ok ? "success" : "danger"}>{msg.text}</Notice>}
    </form>
  );
}

export function SourceEditForm({ id, initial }: { id: string; initial: { verificationStatus: string; permissionStatus: string; permissionNotes: string; knownLimitations: string; sourceUrl: string; retrievalDate: string } }) {
  const [v, setV] = useState(initial);
  const [msg, setMsg] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Verification" htmlFor="sv"><Select id="sv" value={v.verificationStatus} onChange={set("verificationStatus")}><option value="unverified">Unverified</option><option value="verified">Verified against the original</option><option value="disputed">Disputed</option></Select></Field>
        <Field label="Rights" htmlFor="sp"><Select id="sp" value={v.permissionStatus} onChange={set("permissionStatus")}><option value="unknown">Unknown</option><option value="reference_only">Reference only</option><option value="licensed">Licensed</option><option value="own_content">Own content</option><option value="restricted">Restricted</option></Select></Field>
        <Field label="Source URL" htmlFor="su"><Input id="su" value={v.sourceUrl} onChange={set("sourceUrl")} /></Field>
        <Field label="Retrieval date" htmlFor="sd"><Input id="sd" type="date" value={v.retrievalDate} onChange={set("retrievalDate")} /></Field>
      </div>
      <Field label="Rights notes" htmlFor="sn"><Textarea id="sn" rows={2} value={v.permissionNotes} onChange={set("permissionNotes")} /></Field>
      <Field label="Known limitations" htmlFor="sl"><Textarea id="sl" rows={3} value={v.knownLimitations} onChange={set("knownLimitations")} /></Field>
      <Button disabled={pending} onClick={() => start(async () => { const r = await updateSourceAction(id, v); setMsg(r); if (r.ok) router.refresh(); })}>Save</Button>
      {msg && <Notice tone={msg.ok ? "success" : "danger"}>{msg.ok ? msg.message : msg.error}</Notice>}
    </div>
  );
}

export function CandidateActions({ id, chapters, defaultMarks, rawText }: { id: string; chapters: { id: string; name: string }[]; defaultMarks: number | null; rawText: string }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!open)
    return (
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setOpen(true)}>Create draft question</Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => { const r = await discardCandidateAction(id); setMsg(r); if (r.ok) router.refresh(); })}>Discard</Button>
        {msg && !msg.ok && <span className="text-sm text-danger">{msg.error}</span>}
      </div>
    );
  return (
    <form
      className="space-y-3 rounded-md border border-line p-3"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        start(async () => {
          const r = await createFromCandidateAction(id, { code: String(f.get("code")), chapterId: String(f.get("chapterId")), marks: Number(f.get("marks")), answerFormat: String(f.get("answerFormat")), stem: String(f.get("stem")) });
          if (r && !r.ok) setMsg(r);
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Code" htmlFor={`code-${id}`}><Input id={`code-${id}`} name="code" required placeholder="M10-PYQ-001" /></Field>
        <Field label="Chapter" htmlFor={`ch-${id}`}><Select id={`ch-${id}`} name="chapterId">{chapters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Marks" htmlFor={`m-${id}`}><Input id={`m-${id}`} name="marks" type="number" min={1} max={20} defaultValue={defaultMarks ?? 3} /></Field>
        <Field label="Format" htmlFor={`f-${id}`}><Select id={`f-${id}`} name="answerFormat" defaultValue="math_working">{["mcq", "numerical", "math_working", "short_answer", "long_answer", "structured"].map((x) => <option key={x} value={x}>{x.replace("_", " ")}</option>)}</Select></Field>
      </div>
      <Field label="Question text (clean up the extraction; use \( … \) for maths)" htmlFor={`s-${id}`}><Textarea id={`s-${id}`} name="stem" rows={6} defaultValue={rawText} /></Field>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>{pending && <Spinner label="Creating" />}Create draft</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
      {msg && !msg.ok && <Notice tone="danger">{msg.error}</Notice>}
    </form>
  );
}
