import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, createUser, type TestDb } from "../helpers/db";
import { makePdf } from "../helpers/pdf";
import * as s from "@/lib/db/schema";
import { runIngestion } from "@/lib/ingest/run";
import { extractPdfPages, isPdf } from "@/lib/ingest/pdf";

let t: TestDb;
let editor: string;
beforeAll(async () => {
  t = await createTestDb();
  editor = await createUser(t, { roles: ["content_editor"] });
});
afterAll(async () => t.close());

const pdf = makePdf([
  ["SECTION A", "Question 1", "(a) Solve the equation 2x + 3 = 11 for x.  [2]", "(b) Find the value of 3 cubed minus 7.  [1]", "Question 2", "Find the mean of 4, 8, 12 and 16 using the formula.  [3]"],
  [],
]);

describe("PDF ingestion", () => {
  it("reads the text layer per page", async () => {
    expect(isPdf(pdf)).toBe(true);
    const pages = await extractPdfPages(pdf);
    expect(pages).toHaveLength(2);
    expect(pages[0].text).toContain("Question 2");
    expect(pages[1].text.trim()).toBe("");
  });

  it("creates reviewable candidates and flags scanned pages honestly when OCR is unavailable", async () => {
    const [doc] = await t.db.insert(s.sourceDocuments).values({ title: "Test paper", documentType: "board_paper", permissionStatus: "licensed" }).returning();
    const [job] = await t.db.insert(s.ingestionJobs).values({ sourceDocumentId: doc.id, status: "processing", createdBy: editor }).returning();
    await runIngestion({ db: t.db, provider: null }, { jobId: job.id, pdf, userId: editor });
    const [done] = await t.db.select().from(s.ingestionJobs).where(eq(s.ingestionJobs.id, job.id));
    expect(done).toMatchObject({ status: "ready", stats: { pages: 2, textLayerPages: 1, ocrPages: 0, unreadablePages: 1, candidates: 2 } });
    const pages = await t.db.select().from(s.extractedPages).where(eq(s.extractedPages.jobId, job.id));
    expect(pages.find((p) => p.pageNumber === 2)).toMatchObject({ method: "none", needsReview: true });
    const cands = await t.db.select().from(s.extractionCandidates).where(eq(s.extractionCandidates.jobId, job.id));
    expect(cands.map((c) => [c.questionNumber, c.detectedMarks, c.status])).toEqual([["1", 3, "pending"], ["2", 3, "pending"]]);
    expect(await t.db.select().from(s.questions)).toEqual([]);
  });

  it("marks the job failed on a broken file instead of half-importing", async () => {
    const [doc] = await t.db.insert(s.sourceDocuments).values({ title: "Broken", documentType: "board_paper", permissionStatus: "licensed" }).returning();
    const [job] = await t.db.insert(s.ingestionJobs).values({ sourceDocumentId: doc.id, status: "processing" }).returning();
    await runIngestion({ db: t.db, provider: null }, { jobId: job.id, pdf: Buffer.from("%PDF-1.4 nonsense"), userId: editor });
    const [done] = await t.db.select().from(s.ingestionJobs).where(eq(s.ingestionJobs.id, job.id));
    expect(done.status).toBe("failed");
  });
});
