import {
  index,
  integer,
  jsonb,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
  boolean,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import {
  answerFormat,
  app,
  difficulty,
  permissionStatus,
  profiles,
  publicationStatus,
  revisionStatus,
  sourceDocuments,
  sourceType,
  subjects,
  syllabusTopics,
  verificationStatus,
} from "./core";
import type {
  AlternativeMethod,
  AnswerKey,
  GenerationMeta,
  QuestionContent,
  RichText,
  SolutionStep,
} from "../../content/types";

/**
 * A question's identity and catalogue metadata. Its text lives in immutable `question_revisions`;
 * `published_*_revision_id` point at the approved revisions students see. Marks, format and
 * difficulty are copied from the published revision on publish so the library can filter cheaply.
 */
export const questions = app.table(
  "questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull().unique(),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id),
    chapterId: uuid("chapter_id").references(() => syllabusTopics.id),
    sourceType: sourceType("source_type").notNull(),
    paperId: uuid("paper_id").references((): AnyPgColumn => papers.id),
    sourceDocumentId: uuid("source_document_id").references(() => sourceDocuments.id),
    sourcePage: text("source_page"),
    sourceQuestionNumber: text("source_question_number"),
    examYear: integer("exam_year"),
    syllabusYear: text("syllabus_year").notNull(),
    permissionStatus: permissionStatus("permission_status").notNull().default("unknown"),
    publicationStatus: publicationStatus("publication_status").notNull().default("draft"),
    publishedRevisionId: uuid("published_revision_id").references((): AnyPgColumn => questionRevisions.id),
    publishedSolutionId: uuid("published_solution_id").references((): AnyPgColumn => solutionRevisions.id),
    publishedRubricId: uuid("published_rubric_id").references((): AnyPgColumn => rubricRevisions.id),
    marks: smallint("marks"),
    answerFormat: answerFormat("answer_format"),
    difficulty: difficulty("difficulty"),
    difficultyValidated: boolean("difficulty_validated").notNull().default(false),
    /** Plain text (maths stripped) used to build the full-text `search` column (see custom SQL). */
    searchText: text("search_text").notNull().default(""),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (t) => [
    index("questions_library_idx").on(t.publicationStatus, t.subjectId, t.chapterId),
    index("questions_source_idx").on(t.sourceType, t.examYear),
    index("questions_paper_idx").on(t.paperId),
  ],
);

export const questionTopics = app.table(
  "question_topics",
  {
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => syllabusTopics.id),
  },
  (t) => [primaryKey({ columns: [t.questionId, t.topicId] }), index("question_topics_topic_idx").on(t.topicId)],
);

const reviewColumns = {
  status: revisionStatus("status").notNull().default("draft"),
  changeNote: text("change_note"),
  createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  reviewedBy: uuid("reviewed_by").references(() => profiles.id, { onDelete: "set null" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewNote: text("review_note"),
  /** Present when the revision was drafted with AI assistance; never cleared by later edits. */
  generation: jsonb("generation").$type<GenerationMeta>(),
};

export const questionRevisions = app.table(
  "question_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    revisionNumber: integer("revision_number").notNull(),
    content: jsonb("content").$type<QuestionContent>().notNull(),
    answerFormat: answerFormat("answer_format").notNull(),
    marks: smallint("marks").notNull(),
    answerKey: jsonb("answer_key").$type<AnswerKey | null>(),
    hints: jsonb("hints").$type<RichText[]>().notNull().default([]),
    difficulty: difficulty("difficulty"),
    ...reviewColumns,
  },
  (t) => [
    unique("question_revisions_number_key").on(t.questionId, t.revisionNumber),
    index("question_revisions_status_idx").on(t.status),
  ],
);

export const solutionRevisions = app.table(
  "solution_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    questionRevisionId: uuid("question_revision_id")
      .notNull()
      .references(() => questionRevisions.id),
    revisionNumber: integer("revision_number").notNull(),
    modelAnswer: text("model_answer").notNull(),
    finalAnswer: text("final_answer").notNull(),
    steps: jsonb("steps").$type<SolutionStep[]>().notNull(),
    commonMistakes: jsonb("common_mistakes").$type<RichText[]>().notNull().default([]),
    alternativeMethods: jsonb("alternative_methods").$type<AlternativeMethod[]>().notNull().default([]),
    ...reviewColumns,
  },
  (t) => [
    unique("solution_revisions_number_key").on(t.questionId, t.revisionNumber),
    index("solution_revisions_status_idx").on(t.status),
  ],
);

export const rubricRevisions = app.table(
  "rubric_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    questionRevisionId: uuid("question_revision_id")
      .notNull()
      .references(() => questionRevisions.id),
    revisionNumber: integer("revision_number").notNull(),
    totalMarks: smallint("total_marks").notNull(),
    notes: text("notes"),
    ...reviewColumns,
  },
  (t) => [
    unique("rubric_revisions_number_key").on(t.questionId, t.revisionNumber),
    index("rubric_revisions_status_idx").on(t.status),
  ],
);

export const rubricCriteria = app.table(
  "rubric_criteria",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rubricRevisionId: uuid("rubric_revision_id")
      .notNull()
      .references(() => rubricRevisions.id, { onDelete: "cascade" }),
    criterionKey: text("criterion_key").notNull(),
    partKey: text("part_key"),
    position: smallint("position").notNull(),
    description: text("description").notNull(),
    marksAvailable: smallint("marks_available").notNull(),
    expectedEvidence: text("expected_evidence").notNull(),
    acceptedAlternatives: jsonb("accepted_alternatives").$type<string[]>().notNull().default([]),
    partialCreditRules: text("partial_credit_rules"),
    commonErrors: jsonb("common_errors").$type<string[]>().notNull().default([]),
  },
  (t) => [unique("rubric_criteria_key").on(t.rubricRevisionId, t.criterionKey)],
);

export const contentReviews = app.table(
  "content_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contentType: text("content_type", {
      enum: ["question_revision", "solution_revision", "rubric_revision", "source_document", "syllabus_topic", "paper"],
    }).notNull(),
    contentId: uuid("content_id").notNull(),
    reviewerId: uuid("reviewer_id").references(() => profiles.id, { onDelete: "set null" }),
    reviewType: text("review_type", { enum: ["academic", "rights", "transcription"] }).notNull(),
    decision: text("decision", { enum: ["approved", "changes_requested", "rejected"] }).notNull(),
    comments: text("comments"),
    checks: jsonb("checks").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("content_reviews_content_idx").on(t.contentType, t.contentId)],
);

export const papers = app.table(
  "papers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id),
    title: text("title").notNull(),
    paperType: text("paper_type", { enum: ["board", "specimen", "practice_set"] }).notNull(),
    availability: text("availability", { enum: ["hosted", "external_reference"] }).notNull(),
    externalUrl: text("external_url"),
    examinationYear: integer("examination_year"),
    syllabusYear: text("syllabus_year").notNull(),
    /** Only set when verified against the source, or when the paper is our own practice set. */
    durationMinutes: smallint("duration_minutes"),
    maximumMarks: smallint("maximum_marks"),
    instructions: text("instructions"),
    sourceDocumentId: uuid("source_document_id").references(() => sourceDocuments.id),
    verificationStatus: verificationStatus("verification_status").notNull().default("unverified"),
    publicationStatus: publicationStatus("publication_status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("papers_subject_idx").on(t.subjectId, t.publicationStatus)],
);

export const paperSections = app.table(
  "paper_sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paperId: uuid("paper_id")
      .notNull()
      .references(() => papers.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    instructions: text("instructions"),
    position: smallint("position").notNull(),
    choiceRule: text("choice_rule", { enum: ["all", "any_n"] }).notNull().default("all"),
    chooseN: smallint("choose_n"),
    /** How extra answers in an any_n section are counted. This is our practice-set rule, not CISCE's. */
    overAttemptPolicy: text("over_attempt_policy", { enum: ["best_n"] }).notNull().default("best_n"),
  },
  (t) => [unique("paper_sections_position_key").on(t.paperId, t.position)],
);

export const paperItems = app.table(
  "paper_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paperId: uuid("paper_id")
      .notNull()
      .references(() => papers.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => paperSections.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id),
    position: smallint("position").notNull(),
    displayNumber: text("display_number").notNull(),
  },
  (t) => [unique("paper_items_position_key").on(t.paperId, t.position), index("paper_items_question_idx").on(t.questionId)],
);

export const issueReports = app.table(
  "issue_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => profiles.id, { onDelete: "set null" }),
    category: text("category", {
      enum: ["question_error", "solution_error", "rendering", "marking", "copyright", "other"],
    }).notNull(),
    message: text("message").notNull(),
    status: text("status", { enum: ["open", "resolved", "dismissed"] }).notNull().default("open"),
    resolutionNote: text("resolution_note"),
    resolvedBy: uuid("resolved_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("issue_reports_status_idx").on(t.status, t.createdAt)],
);
