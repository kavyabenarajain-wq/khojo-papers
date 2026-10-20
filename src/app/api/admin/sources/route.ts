import { NextResponse, after, type NextRequest } from "next/server";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { runAs } from "@/lib/db/rls";
import * as s from "@/lib/db/schema";
import { getViewer } from "@/lib/auth/session";
import { canEditContent } from "@/lib/auth/rbac";
import { isSameOrigin } from "@/lib/auth/request";
import { integrations } from "@/lib/env";
import { audit } from "@/lib/audit";
import { BUCKETS, supabaseAdmin } from "@/lib/supabase/admin";
import { isPdf, MAX_PDF_BYTES } from "@/lib/ingest/pdf";
import { runIngestion } from "@/lib/ingest/run";
import { azureProvider } from "@/lib/ai/azure";

const err = (status: number, error: string) => NextResponse.json({ error }, { status });

const Meta = z.object({
  title: z.string().trim().min(3).max(200),
  documentType: z.enum(["syllabus", "regulations", "specimen_paper", "board_paper", "textbook", "other"]),
  classLevel: z.coerce.number().int().min(1).max(12).nullable(),
  examinationYear: z.coerce.number().int().min(1990).max(2100).nullable(),
  syllabusYear: z.string().trim().max(20).nullable(),
  sourceUrl: z.url().max(500).nullable(),
  permissionStatus: z.enum(["unknown", "reference_only", "licensed", "own_content", "restricted"]),
  permissionNotes: z.string().trim().max(2000).nullable(),
  retrievalDate: z.iso.date().nullable(),
  knownLimitations: z.string().trim().max(2000).nullable(),
});

/** Register a source document, optionally storing the PDF (only when rights allow) and importing it. */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return err(403, "Cross-site requests are not allowed.");
  if (!integrations.supabase || !integrations.database) return err(503, "Not configured.");
  const v = await getViewer();
  if (!v || !canEditContent(v)) return err(403, "Only content editors can add source documents.");
  if (Number(req.headers.get("content-length") ?? 0) > MAX_PDF_BYTES + 100_000) return err(413, "The PDF is larger than 40 MB.");
  const form = await req.formData();
  const val = (k: string) => {
    const x = form.get(k);
    return typeof x === "string" && x.trim() ? x.trim() : null;
  };
  const parsed = Meta.safeParse({
    title: val("title"),
    documentType: val("documentType"),
    classLevel: val("classLevel"),
    examinationYear: val("examinationYear"),
    syllabusYear: val("syllabusYear"),
    sourceUrl: val("sourceUrl"),
    permissionStatus: val("permissionStatus"),
    permissionNotes: val("permissionNotes"),
    retrievalDate: val("retrievalDate"),
    knownLimitations: val("knownLimitations"),
  });
  if (!parsed.success) return err(400, parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const m = parsed.data;
  const file = form.get("file");
  const hasFile = file instanceof File && file.size > 0;
  if (hasFile && !["licensed", "own_content"].includes(m.permissionStatus)) {
    return err(422, "Only store a copy of a document when we have the right to (licensed or our own). Otherwise record its details and link to the official source.");
  }
  const db = getDb();
  let storagePath: string | null = null;
  let pdf: Buffer | null = null;
  if (hasFile) {
    pdf = Buffer.from(await (file as File).arrayBuffer());
    if (!isPdf(pdf)) return err(422, "That file isn't a PDF.");
    storagePath = `${randomUUID()}.pdf`;
    const { error } = await supabaseAdmin().storage.from(BUCKETS.sources).upload(storagePath, pdf, { contentType: "application/pdf" });
    if (error) return err(502, `Couldn't store the file: ${error.message}`);
  }
  const result = await runAs(db, v.id, async (tx) => {
    const [doc] = await tx
      .insert(s.sourceDocuments)
      .values({ ...m, storagePath, verificationStatus: "unverified", createdBy: v.id })
      .returning();
    if (storagePath && pdf) {
      await tx.insert(s.uploads).values({ userId: v.id, purpose: "source_document", bucket: BUCKETS.sources, storagePath, mimeType: "application/pdf", sizeBytes: pdf.length, sha256: createHash("sha256").update(pdf).digest("hex") });
    }
    await audit(tx, { actorId: v.id, action: "source_document.created", entityType: "source_document", entityId: doc.id, details: { permission: m.permissionStatus, stored: Boolean(storagePath) } });
    const job = pdf ? (await tx.insert(s.ingestionJobs).values({ sourceDocumentId: doc.id, status: "processing", createdBy: v.id }).returning())[0] : null;
    return { doc, job };
  });
  if (result.job && pdf) {
    const jobId = result.job.id;
    const buf = pdf;
    // Import after responding; the job page shows progress and the outcome.
    after(() => runIngestion({ db, provider: integrations.ai ? azureProvider : null }, { jobId, pdf: buf, userId: v.id }));
  }
  return NextResponse.json({ id: result.doc.id, jobId: result.job?.id ?? null });
}
