import { eq } from "drizzle-orm";
import * as s from "../db/schema";
import type { Db } from "../db/types";
import { callStructured, type AiProvider } from "../ai/provider";
import { OCR_PROMPT_VERSION, OCR_SYSTEM, OcrSchema } from "../ai/prompts/ocr";
import { detectCandidates } from "./boundaries";
import { extractPdfPages, renderPdfPage } from "./pdf";

const SCANNED_THRESHOLD = 40;
const OCR_CONFIDENCE = { high: 0.85, medium: 0.6, low: 0.3 } as const;

/**
 * Extract text from an authorised PDF, OCR scanned pages when an AI provider is available, and
 * store question candidates for editors to review. Never creates or publishes questions.
 */
export async function runIngestion(deps: { db: Db; provider: AiProvider | null }, input: { jobId: string; pdf: Buffer; userId: string }) {
  const { db } = deps;
  try {
    const pages = await extractPdfPages(input.pdf);
    const finalPages: { pageNumber: number; text: string }[] = [];
    let ocrPages = 0;
    let unreadable = 0;
    for (const p of pages) {
      const clean = p.text.trim();
      if (clean.length >= SCANNED_THRESHOLD) {
        await db.insert(s.extractedPages).values({ jobId: input.jobId, pageNumber: p.pageNumber, method: "text_layer", text: clean, confidence: 0.95, needsReview: false });
        finalPages.push({ pageNumber: p.pageNumber, text: clean });
        continue;
      }
      if (!deps.provider) {
        unreadable++;
        await db.insert(s.extractedPages).values({ jobId: input.jobId, pageNumber: p.pageNumber, method: "none", text: clean, confidence: 0, needsReview: true, note: "Scanned page: OCR is unavailable because no AI service is configured. Transcribe it manually." });
        continue;
      }
      const image = await renderPdfPage(input.pdf, p.pageNumber);
      const r = await callStructured(
        { provider: deps.provider, db },
        {
          purpose: "ocr",
          promptVersion: OCR_PROMPT_VERSION,
          system: OCR_SYSTEM,
          content: [{ type: "text", text: `Page ${p.pageNumber}.` }, { type: "image", dataUrl: image }],
          schema: OcrSchema,
          schemaName: "page_transcription",
          userId: input.userId,
          vision: true,
          maxOutputTokens: 4000,
          meta: { jobId: input.jobId, page: p.pageNumber },
        },
      );
      if (r.ok) {
        ocrPages++;
        await db.insert(s.extractedPages).values({
          jobId: input.jobId,
          pageNumber: p.pageNumber,
          method: "ocr",
          text: r.data.text,
          confidence: OCR_CONFIDENCE[r.data.confidence],
          needsReview: r.data.confidence !== "high" || r.data.text.includes("[?]"),
          note: [r.data.hasFigures ? "Page has figures: redraw them as validated diagrams." : null, r.data.notes].filter(Boolean).join(" ") || null,
        });
        finalPages.push({ pageNumber: p.pageNumber, text: r.data.text });
      } else {
        unreadable++;
        await db.insert(s.extractedPages).values({ jobId: input.jobId, pageNumber: p.pageNumber, method: "none", text: "", confidence: 0, needsReview: true, note: `OCR failed: ${r.error.slice(0, 200)}` });
      }
    }
    const candidates = detectCandidates(finalPages);
    if (candidates.length) {
      await db.insert(s.extractionCandidates).values(
        candidates.map((c) => ({ jobId: input.jobId, pageNumber: c.pageNumber, questionNumber: c.questionNumber, rawText: c.rawText, detectedMarks: c.detectedMarks, confidence: c.confidence, flags: c.flags })),
      );
    }
    await db
      .update(s.ingestionJobs)
      .set({ status: "ready", finishedAt: new Date(), stats: { pages: pages.length, textLayerPages: pages.length - ocrPages - unreadable, ocrPages, unreadablePages: unreadable, candidates: candidates.length } })
      .where(eq(s.ingestionJobs.id, input.jobId));
  } catch (e) {
    await db.update(s.ingestionJobs).set({ status: "failed", finishedAt: new Date(), error: e instanceof Error ? e.message.slice(0, 500) : "Unknown error" }).where(eq(s.ingestionJobs.id, input.jobId));
  }
}
