import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { app, profiles } from "./core";
import {
  paperItems,
  papers,
  questionRevisions,
  questions,
  rubricCriteria,
  rubricRevisions,
  solutionRevisions,
} from "./content";
import type { Answer, EvaluationSummary, TranscriptSegment } from "../../content/types";

export const attempts = app.table(
  "attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    mode: text("mode", { enum: ["practice", "exam", "examiner"] }).notNull(),
    paperId: uuid("paper_id").references(() => papers.id),
    status: text("status", { enum: ["in_progress", "submitted", "abandoned"] }).notNull().default("in_progress"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    /** Server-set for timed exam mode. Saves after the deadline (plus grace) are rejected. */
    deadlineAt: timestamp("deadline_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("attempts_user_idx").on(t.userId, t.status, t.updatedAt)],
);

export const uploads = app.table(
  "uploads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    purpose: text("purpose", { enum: ["answer_image", "source_document"] }).notNull(),
    bucket: text("bucket").notNull(),
    storagePath: text("storage_path").notNull().unique(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    sha256: text("sha256").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("uploads_user_idx").on(t.userId, t.createdAt)],
);

/**
 * One student's answer to one question within an attempt. Pins the exact question and rubric
 * revisions in force when it was started, so later edits never change how it was marked.
 */
export const responses = app.table(
  "responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id),
    questionRevisionId: uuid("question_revision_id")
      .notNull()
      .references(() => questionRevisions.id),
    rubricRevisionId: uuid("rubric_revision_id").references(() => rubricRevisions.id),
    paperItemId: uuid("paper_item_id").references(() => paperItems.id),
    answer: jsonb("answer").$type<Answer>().notNull().default({}),
    uploadId: uuid("upload_id").references(() => uploads.id, { onDelete: "set null" }),
    locked: boolean("locked").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("responses_attempt_question_key").on(t.attemptId, t.questionId),
    index("responses_user_question_idx").on(t.userId, t.questionId),
  ],
);

export const aiRuns = app.table(
  "ai_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    purpose: text("purpose", { enum: ["recognize", "evaluate", "generate", "ocr", "benchmark"] }).notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    status: text("status", { enum: ["ok", "invalid_output", "error", "refused"] }).notNull(),
    latencyMs: integer("latency_ms"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    requestMeta: jsonb("request_meta").$type<Record<string, unknown>>().notNull().default({}),
    output: jsonb("output"),
    error: text("error"),
    userId: uuid("user_id").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_runs_purpose_idx").on(t.purpose, t.createdAt), index("ai_runs_user_idx").on(t.userId, t.createdAt)],
);

export const transcripts = app.table(
  "transcripts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    responseId: uuid("response_id")
      .notNull()
      .references(() => responses.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    uploadId: uuid("upload_id").references(() => uploads.id, { onDelete: "set null" }),
    aiRunId: uuid("ai_run_id").references(() => aiRuns.id, { onDelete: "set null" }),
    status: text("status", { enum: ["ready", "unreadable", "failed"] }).notNull(),
    legibility: text("legibility", { enum: ["good", "fair", "poor", "unreadable"] }),
    aiText: text("ai_text"),
    segments: jsonb("segments").$type<TranscriptSegment[]>().notNull().default([]),
    notes: text("notes"),
    confirmedText: text("confirmed_text"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    editDistance: integer("edit_distance"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("transcripts_response_idx").on(t.responseId)],
);

/** A mark given to a response. Rows are never overwritten; a teacher re-mark is a new row. */
export const evaluations = app.table(
  "evaluations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    responseId: uuid("response_id")
      .notNull()
      .references(() => responses.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    method: text("method", { enum: ["deterministic", "ai", "teacher", "self"] }).notNull(),
    status: text("status", { enum: ["completed", "needs_review", "failed", "not_evaluable"] }).notNull(),
    awarded: numeric("awarded", { precision: 5, scale: 1, mode: "number" }),
    maximum: smallint("maximum").notNull(),
    isCorrect: boolean("is_correct"),
    rubricRevisionId: uuid("rubric_revision_id").references(() => rubricRevisions.id),
    transcriptId: uuid("transcript_id").references(() => transcripts.id, { onDelete: "set null" }),
    aiRunId: uuid("ai_run_id").references(() => aiRuns.id, { onDelete: "set null" }),
    evaluatorId: uuid("evaluator_id").references(() => profiles.id, { onDelete: "set null" }),
    summary: jsonb("summary").$type<EvaluationSummary>().notNull().default({}),
    needsHumanReview: boolean("needs_human_review").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("evaluations_response_idx").on(t.responseId),
    index("evaluations_user_idx").on(t.userId, t.createdAt),
    index("evaluations_method_idx").on(t.method, t.status),
  ],
);

export const criterionScores = app.table(
  "criterion_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    evaluationId: uuid("evaluation_id")
      .notNull()
      .references(() => evaluations.id, { onDelete: "cascade" }),
    criterionId: uuid("criterion_id").references(() => rubricCriteria.id),
    criterionKey: text("criterion_key").notNull(),
    marksAvailable: numeric("marks_available", { precision: 5, scale: 1, mode: "number" }).notNull(),
    marksAwarded: numeric("marks_awarded", { precision: 5, scale: 1, mode: "number" }).notNull(),
    evidence: text("evidence"),
    reason: text("reason"),
    feedback: text("feedback"),
    alternativeMethod: text("alternative_method"),
    uncertain: boolean("uncertain").notNull().default(false),
    mistakeCategory: text("mistake_category"),
  },
  (t) => [unique("criterion_scores_key").on(t.evaluationId, t.criterionKey)],
);

export const solutionReveals = app.table(
  "solution_reveals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    solutionRevisionId: uuid("solution_revision_id")
      .notNull()
      .references(() => solutionRevisions.id),
    beforeAttempt: boolean("before_attempt").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("solution_reveals_user_idx").on(t.userId, t.questionId)],
);

export const bookmarks = app.table(
  "bookmarks",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.questionId] })],
);

export const humanReviewRequests = app.table(
  "human_review_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    evaluationId: uuid("evaluation_id")
      .notNull()
      .references(() => evaluations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    source: text("source", { enum: ["student", "system"] }).notNull(),
    reason: text("reason"),
    status: text("status", { enum: ["open", "resolved"] }).notNull().default("open"),
    resolvedBy: uuid("resolved_by").references(() => profiles.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    teacherEvaluationId: uuid("teacher_evaluation_id").references(() => evaluations.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("human_review_requests_evaluation_key").on(t.evaluationId),
    index("human_review_requests_status_idx").on(t.status, t.createdAt),
  ],
);

// ---------------------------------------------------------------------------------------------
// Content ingestion and examiner calibration
// ---------------------------------------------------------------------------------------------

export const ingestionJobs = app.table("ingestion_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceDocumentId: uuid("source_document_id").notNull(),
  status: text("status", { enum: ["processing", "ready", "failed"] }).notNull(),
  error: text("error"),
  stats: jsonb("stats").$type<Record<string, number>>().notNull().default({}),
  createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const extractedPages = app.table(
  "extracted_pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => ingestionJobs.id, { onDelete: "cascade" }),
    pageNumber: integer("page_number").notNull(),
    method: text("method", { enum: ["text_layer", "ocr", "none"] }).notNull(),
    text: text("text").notNull().default(""),
    confidence: real("confidence"),
    needsReview: boolean("needs_review").notNull().default(false),
    note: text("note"),
  },
  (t) => [unique("extracted_pages_key").on(t.jobId, t.pageNumber)],
);

export const extractionCandidates = app.table(
  "extraction_candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => ingestionJobs.id, { onDelete: "cascade" }),
    pageNumber: integer("page_number").notNull(),
    questionNumber: text("question_number"),
    rawText: text("raw_text").notNull(),
    detectedMarks: smallint("detected_marks"),
    confidence: real("confidence").notNull(),
    flags: jsonb("flags").$type<string[]>().notNull().default([]),
    status: text("status", { enum: ["pending", "accepted", "discarded"] }).notNull().default("pending"),
    questionId: uuid("question_id").references(() => questions.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("extraction_candidates_job_idx").on(t.jobId, t.status)],
);

/** Student answers marked independently by a teacher, used to measure AI-teacher agreement. */
export const examinerBenchmarks = app.table(
  "examiner_benchmarks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    rubricRevisionId: uuid("rubric_revision_id")
      .notNull()
      .references(() => rubricRevisions.id),
    category: text("category", {
      enum: [
        "correct",
        "partially_correct",
        "incorrect",
        "alternative_method",
        "equivalent_wording",
        "misconception",
        "illegible",
        "ambiguous_notation",
        "crossed_out",
        "diagram",
        "incomplete_rubric",
      ],
    }).notNull(),
    answerText: text("answer_text").notNull(),
    teacherTotal: numeric("teacher_total", { precision: 5, scale: 1, mode: "number" }).notNull(),
    teacherCriteria: jsonb("teacher_criteria").$type<Record<string, number>>().notNull(),
    /** Teacher's view of whether a careful examiner should refuse to mark this confidently. */
    expectNeedsReview: boolean("expect_needs_review").notNull().default(false),
    markedBy: uuid("marked_by").references(() => profiles.id, { onDelete: "set null" }),
    markerName: text("marker_name"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("examiner_benchmarks_question_idx").on(t.questionId)],
);

export const benchmarkRuns = app.table("benchmark_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
  model: text("model").notNull(),
  promptVersion: text("prompt_version").notNull(),
  itemCount: integer("item_count").notNull(),
  metrics: jsonb("metrics").$type<Record<string, unknown>>().notNull(),
  results: jsonb("results").$type<unknown[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
