import {
  date,
  integer,
  jsonb,
  pgSchema,
  smallint,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
  unique,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";

/**
 * All application tables live in the `app` schema. Supabase's Data API only exposes `public`,
 * so nothing here is reachable with the browser's publishable key; the server reads and writes
 * through Drizzle, and RLS still applies inside `withUser()` transactions.
 */
export const app = pgSchema("app");

/** Minimal reference to Supabase's auth.users so profiles can cascade on account deletion. */
const auth = pgSchema("auth");
export const authUsers = auth.table("users", {
  id: uuid("id").primaryKey(),
  email: text("email"),
});

export const ROLES = ["student", "teacher_reviewer", "content_editor", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const ageBracket = app.enum("age_bracket", ["under_18", "adult"]);
export const consentStatus = app.enum("consent_status", ["not_required", "pending", "granted", "withdrawn"]);
export const sourceType = app.enum("source_type", ["official_pyq", "official_specimen", "original_practice"]);
export const permissionStatus = app.enum("permission_status", [
  "unknown",
  "reference_only",
  "licensed",
  "own_content",
  "restricted",
]);
export const verificationStatus = app.enum("verification_status", ["unverified", "verified", "disputed"]);
export const revisionStatus = app.enum("revision_status", [
  "draft",
  "in_review",
  "approved",
  "rejected",
  "superseded",
]);
export const publicationStatus = app.enum("publication_status", ["draft", "published", "unpublished"]);
export const answerFormat = app.enum("answer_format", [
  "mcq",
  "short_answer",
  "long_answer",
  "numerical",
  "math_working",
  "structured",
  "diagram",
  "map",
  "passage",
]);
export const difficulty = app.enum("difficulty", ["easy", "medium", "hard"]);
export const documentType = app.enum("document_type", [
  "syllabus",
  "regulations",
  "specimen_paper",
  "board_paper",
  "textbook",
  "other",
]);

export const profiles = app.table("profiles", {
  id: uuid("id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  displayName: text("display_name"),
  roles: text("roles").array().notNull().default(["student"]),
  classLevel: smallint("class_level").notNull().default(10),
  ageBracket: ageBracket("age_bracket").notNull(),
  guardianEmail: text("guardian_email"),
  consentStatus: consentStatus("consent_status").notNull(),
  consentGrantedAt: timestamp("consent_granted_at", { withTimezone: true }),
  consentRequestedAt: timestamp("consent_requested_at", { withTimezone: true }),
  preferences: jsonb("preferences").$type<UserPreferences>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UserPreferences = {
  textSize?: "default" | "large" | "larger";
  reducedMotion?: boolean;
  highContrast?: boolean;
};

export const subjects = app.table("subjects", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  classLevel: smallint("class_level").notNull(),
  syllabusYear: text("syllabus_year").notNull(),
  status: text("status", { enum: ["active", "planned", "retired"] }).notNull().default("planned"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sourceDocuments = app.table(
  "source_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    documentType: documentType("document_type").notNull(),
    subjectId: uuid("subject_id").references(() => subjects.id),
    classLevel: smallint("class_level"),
    examinationYear: integer("examination_year"),
    syllabusYear: text("syllabus_year"),
    sourceUrl: text("source_url"),
    storagePath: text("storage_path"),
    permissionStatus: permissionStatus("permission_status").notNull().default("unknown"),
    permissionNotes: text("permission_notes"),
    retrievalDate: date("retrieval_date"),
    pageCount: integer("page_count"),
    verificationStatus: verificationStatus("verification_status").notNull().default("unverified"),
    knownLimitations: text("known_limitations"),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("source_documents_subject_idx").on(t.subjectId)],
);

export const syllabusTopics = app.table(
  "syllabus_topics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id),
    parentId: uuid("parent_id").references((): AnyPgColumn => syllabusTopics.id),
    kind: text("kind", { enum: ["chapter", "topic"] }).notNull(),
    slug: text("slug").notNull(),
    /** Unit heading from the syllabus (e.g. "Algebra"), kept on chapters for grouping. */
    unitName: text("unit_name"),
    name: text("name").notNull(),
    learningObjective: text("learning_objective"),
    syllabusYear: text("syllabus_year").notNull(),
    sourceDocumentId: uuid("source_document_id").references(() => sourceDocuments.id),
    sourcePage: text("source_page"),
    position: integer("position").notNull().default(0),
    verificationStatus: verificationStatus("verification_status").notNull().default("unverified"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("syllabus_topics_subject_slug_key").on(t.subjectId, t.slug),
    index("syllabus_topics_parent_idx").on(t.parentId),
  ],
);

export const auditLog = app.table(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => profiles.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_entity_idx").on(t.entityType, t.entityId),
    index("audit_log_created_idx").on(t.createdAt),
  ],
);

export const rateLimits = app.table(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

export const policyVersions = app.table("policy_versions", {
  id: text("id").primaryKey(),
  kind: text("kind", { enum: ["privacy", "guardian_consent"] }).notNull(),
  summary: text("summary").notNull(),
  effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
});

export const consentTokens = app.table(
  "consent_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    guardianEmail: text("guardian_email").notNull(),
    /** `grant` links ask for consent; `withdraw` links (sent after consent) let the guardian revoke it. */
    purpose: text("purpose", { enum: ["grant", "withdraw"] }).notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    policyVersion: text("policy_version")
      .notNull()
      .references(() => policyVersions.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("consent_tokens_user_idx").on(t.userId)],
);

export const consentRecords = app.table(
  "consent_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    guardianEmail: text("guardian_email").notNull(),
    action: text("action", { enum: ["granted", "withdrawn"] }).notNull(),
    policyVersion: text("policy_version")
      .notNull()
      .references(() => policyVersions.id),
    method: text("method").notNull(),
    ipHash: text("ip_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("consent_records_user_idx").on(t.userId)],
);

/** Kept without personal data so we can show that deletions were completed. */
export const deletionRequests = app.table("deletion_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  reason: text("reason", { enum: ["user_request", "consent_withdrawn", "consent_expired"] }).notNull(),
  status: text("status", { enum: ["completed", "failed"] }).notNull(),
  detail: text("detail"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});
