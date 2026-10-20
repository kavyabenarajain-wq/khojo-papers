-- auth.users is owned by Supabase Auth; it is referenced, never created, here.
CREATE SCHEMA "app";
--> statement-breakpoint
CREATE TYPE "app"."age_bracket" AS ENUM('under_18', 'adult');--> statement-breakpoint
CREATE TYPE "app"."answer_format" AS ENUM('mcq', 'short_answer', 'long_answer', 'numerical', 'math_working', 'structured', 'diagram', 'map', 'passage');--> statement-breakpoint
CREATE TYPE "app"."consent_status" AS ENUM('not_required', 'pending', 'granted', 'withdrawn');--> statement-breakpoint
CREATE TYPE "app"."difficulty" AS ENUM('easy', 'medium', 'hard');--> statement-breakpoint
CREATE TYPE "app"."document_type" AS ENUM('syllabus', 'regulations', 'specimen_paper', 'board_paper', 'textbook', 'other');--> statement-breakpoint
CREATE TYPE "app"."permission_status" AS ENUM('unknown', 'reference_only', 'licensed', 'own_content', 'restricted');--> statement-breakpoint
CREATE TYPE "app"."publication_status" AS ENUM('draft', 'published', 'unpublished');--> statement-breakpoint
CREATE TYPE "app"."revision_status" AS ENUM('draft', 'in_review', 'approved', 'rejected', 'superseded');--> statement-breakpoint
CREATE TYPE "app"."source_type" AS ENUM('official_pyq', 'official_specimen', 'original_practice');--> statement-breakpoint
CREATE TYPE "app"."verification_status" AS ENUM('unverified', 'verified', 'disputed');--> statement-breakpoint
CREATE TABLE "app"."audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."consent_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"guardian_email" text NOT NULL,
	"action" text NOT NULL,
	"policy_version" text NOT NULL,
	"method" text NOT NULL,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."consent_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"guardian_email" text NOT NULL,
	"purpose" text NOT NULL,
	"token_hash" text NOT NULL,
	"policy_version" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consent_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "app"."deletion_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reason" text NOT NULL,
	"status" text NOT NULL,
	"detail" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "app"."policy_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"summary" text NOT NULL,
	"effective_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" text,
	"roles" text[] DEFAULT '{"student"}' NOT NULL,
	"class_level" smallint DEFAULT 10 NOT NULL,
	"age_bracket" "app"."age_bracket" NOT NULL,
	"guardian_email" text,
	"consent_status" "app"."consent_status" NOT NULL,
	"consent_granted_at" timestamp with time zone,
	"consent_requested_at" timestamp with time zone,
	"preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."rate_limits" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "app"."source_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"document_type" "app"."document_type" NOT NULL,
	"subject_id" uuid,
	"class_level" smallint,
	"examination_year" integer,
	"syllabus_year" text,
	"source_url" text,
	"storage_path" text,
	"permission_status" "app"."permission_status" DEFAULT 'unknown' NOT NULL,
	"permission_notes" text,
	"retrieval_date" date,
	"page_count" integer,
	"verification_status" "app"."verification_status" DEFAULT 'unverified' NOT NULL,
	"known_limitations" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"class_level" smallint NOT NULL,
	"syllabus_year" text NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subjects_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "app"."syllabus_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"parent_id" uuid,
	"kind" text NOT NULL,
	"slug" text NOT NULL,
	"unit_name" text,
	"name" text NOT NULL,
	"learning_objective" text,
	"syllabus_year" text NOT NULL,
	"source_document_id" uuid,
	"source_page" text,
	"position" integer DEFAULT 0 NOT NULL,
	"verification_status" "app"."verification_status" DEFAULT 'unverified' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "syllabus_topics_subject_slug_key" UNIQUE("subject_id","slug")
);
--> statement-breakpoint
CREATE TABLE "app"."content_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_type" text NOT NULL,
	"content_id" uuid NOT NULL,
	"reviewer_id" uuid,
	"review_type" text NOT NULL,
	"decision" text NOT NULL,
	"comments" text,
	"checks" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."issue_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"user_id" uuid,
	"category" text NOT NULL,
	"message" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolution_note" text,
	"resolved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "app"."paper_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"paper_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"display_number" text NOT NULL,
	CONSTRAINT "paper_items_position_key" UNIQUE("paper_id","position")
);
--> statement-breakpoint
CREATE TABLE "app"."paper_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"paper_id" uuid NOT NULL,
	"label" text NOT NULL,
	"instructions" text,
	"position" smallint NOT NULL,
	"choice_rule" text DEFAULT 'all' NOT NULL,
	"choose_n" smallint,
	"over_attempt_policy" text DEFAULT 'best_n' NOT NULL,
	CONSTRAINT "paper_sections_position_key" UNIQUE("paper_id","position")
);
--> statement-breakpoint
CREATE TABLE "app"."papers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"title" text NOT NULL,
	"paper_type" text NOT NULL,
	"availability" text NOT NULL,
	"external_url" text,
	"examination_year" integer,
	"syllabus_year" text NOT NULL,
	"duration_minutes" smallint,
	"maximum_marks" smallint,
	"instructions" text,
	"source_document_id" uuid,
	"verification_status" "app"."verification_status" DEFAULT 'unverified' NOT NULL,
	"publication_status" "app"."publication_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "papers_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "app"."question_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"content" jsonb NOT NULL,
	"answer_format" "app"."answer_format" NOT NULL,
	"marks" smallint NOT NULL,
	"answer_key" jsonb,
	"hints" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"difficulty" "app"."difficulty",
	"status" "app"."revision_status" DEFAULT 'draft' NOT NULL,
	"change_note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"generation" jsonb,
	CONSTRAINT "question_revisions_number_key" UNIQUE("question_id","revision_number")
);
--> statement-breakpoint
CREATE TABLE "app"."question_topics" (
	"question_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	CONSTRAINT "question_topics_question_id_topic_id_pk" PRIMARY KEY("question_id","topic_id")
);
--> statement-breakpoint
CREATE TABLE "app"."questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"chapter_id" uuid,
	"source_type" "app"."source_type" NOT NULL,
	"paper_id" uuid,
	"source_document_id" uuid,
	"source_page" text,
	"source_question_number" text,
	"exam_year" integer,
	"syllabus_year" text NOT NULL,
	"permission_status" "app"."permission_status" DEFAULT 'unknown' NOT NULL,
	"publication_status" "app"."publication_status" DEFAULT 'draft' NOT NULL,
	"published_revision_id" uuid,
	"published_solution_id" uuid,
	"published_rubric_id" uuid,
	"marks" smallint,
	"answer_format" "app"."answer_format",
	"difficulty" "app"."difficulty",
	"difficulty_validated" boolean DEFAULT false NOT NULL,
	"search_text" text DEFAULT '' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "questions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "app"."rubric_criteria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rubric_revision_id" uuid NOT NULL,
	"criterion_key" text NOT NULL,
	"part_key" text,
	"position" smallint NOT NULL,
	"description" text NOT NULL,
	"marks_available" smallint NOT NULL,
	"expected_evidence" text NOT NULL,
	"accepted_alternatives" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"partial_credit_rules" text,
	"common_errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "rubric_criteria_key" UNIQUE("rubric_revision_id","criterion_key")
);
--> statement-breakpoint
CREATE TABLE "app"."rubric_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"question_revision_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"total_marks" smallint NOT NULL,
	"notes" text,
	"status" "app"."revision_status" DEFAULT 'draft' NOT NULL,
	"change_note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"generation" jsonb,
	CONSTRAINT "rubric_revisions_number_key" UNIQUE("question_id","revision_number")
);
--> statement-breakpoint
CREATE TABLE "app"."solution_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"question_revision_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"model_answer" text NOT NULL,
	"final_answer" text NOT NULL,
	"steps" jsonb NOT NULL,
	"common_mistakes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"alternative_methods" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "app"."revision_status" DEFAULT 'draft' NOT NULL,
	"change_note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"generation" jsonb,
	CONSTRAINT "solution_revisions_number_key" UNIQUE("question_id","revision_number")
);
--> statement-breakpoint
CREATE TABLE "app"."ai_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purpose" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"status" text NOT NULL,
	"latency_ms" integer,
	"input_tokens" integer,
	"output_tokens" integer,
	"request_meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb,
	"error" text,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"paper_id" uuid,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deadline_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."benchmark_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_by" uuid,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"item_count" integer NOT NULL,
	"metrics" jsonb NOT NULL,
	"results" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."bookmarks" (
	"user_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookmarks_user_id_question_id_pk" PRIMARY KEY("user_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "app"."criterion_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evaluation_id" uuid NOT NULL,
	"criterion_id" uuid,
	"criterion_key" text NOT NULL,
	"marks_available" numeric(5, 1) NOT NULL,
	"marks_awarded" numeric(5, 1) NOT NULL,
	"evidence" text,
	"reason" text,
	"feedback" text,
	"alternative_method" text,
	"uncertain" boolean DEFAULT false NOT NULL,
	"mistake_category" text,
	CONSTRAINT "criterion_scores_key" UNIQUE("evaluation_id","criterion_key")
);
--> statement-breakpoint
CREATE TABLE "app"."evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"response_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"method" text NOT NULL,
	"status" text NOT NULL,
	"awarded" numeric(5, 1),
	"maximum" smallint NOT NULL,
	"is_correct" boolean,
	"rubric_revision_id" uuid,
	"transcript_id" uuid,
	"ai_run_id" uuid,
	"evaluator_id" uuid,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"needs_human_review" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."examiner_benchmarks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"rubric_revision_id" uuid NOT NULL,
	"category" text NOT NULL,
	"answer_text" text NOT NULL,
	"teacher_total" numeric(5, 1) NOT NULL,
	"teacher_criteria" jsonb NOT NULL,
	"expect_needs_review" boolean DEFAULT false NOT NULL,
	"marked_by" uuid,
	"marker_name" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."extracted_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"page_number" integer NOT NULL,
	"method" text NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"confidence" real,
	"needs_review" boolean DEFAULT false NOT NULL,
	"note" text,
	CONSTRAINT "extracted_pages_key" UNIQUE("job_id","page_number")
);
--> statement-breakpoint
CREATE TABLE "app"."extraction_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"page_number" integer NOT NULL,
	"question_number" text,
	"raw_text" text NOT NULL,
	"detected_marks" smallint,
	"confidence" real NOT NULL,
	"flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"question_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."human_review_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evaluation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"reason" text,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"teacher_evaluation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "human_review_requests_evaluation_key" UNIQUE("evaluation_id")
);
--> statement-breakpoint
CREATE TABLE "app"."ingestion_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_document_id" uuid NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "app"."responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"question_revision_id" uuid NOT NULL,
	"rubric_revision_id" uuid,
	"paper_item_id" uuid,
	"answer" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"upload_id" uuid,
	"locked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "responses_attempt_question_key" UNIQUE("attempt_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "app"."solution_reveals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"solution_revision_id" uuid NOT NULL,
	"before_attempt" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."transcripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"response_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"upload_id" uuid,
	"ai_run_id" uuid,
	"status" text NOT NULL,
	"legibility" text,
	"ai_text" text,
	"segments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"confirmed_text" text,
	"confirmed_at" timestamp with time zone,
	"edit_distance" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"bucket" text NOT NULL,
	"storage_path" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "uploads_storage_path_unique" UNIQUE("storage_path")
);
--> statement-breakpoint
ALTER TABLE "app"."audit_log" ADD CONSTRAINT "audit_log_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "app"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."consent_records" ADD CONSTRAINT "consent_records_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."consent_records" ADD CONSTRAINT "consent_records_policy_version_policy_versions_id_fk" FOREIGN KEY ("policy_version") REFERENCES "app"."policy_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."consent_tokens" ADD CONSTRAINT "consent_tokens_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."consent_tokens" ADD CONSTRAINT "consent_tokens_policy_version_policy_versions_id_fk" FOREIGN KEY ("policy_version") REFERENCES "app"."policy_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."profiles" ADD CONSTRAINT "profiles_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."source_documents" ADD CONSTRAINT "source_documents_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "app"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."source_documents" ADD CONSTRAINT "source_documents_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "app"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."syllabus_topics" ADD CONSTRAINT "syllabus_topics_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "app"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."syllabus_topics" ADD CONSTRAINT "syllabus_topics_parent_id_syllabus_topics_id_fk" FOREIGN KEY ("parent_id") REFERENCES "app"."syllabus_topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."syllabus_topics" ADD CONSTRAINT "syllabus_topics_source_document_id_source_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "app"."source_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."content_reviews" ADD CONSTRAINT "content_reviews_reviewer_id_profiles_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "app"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."issue_reports" ADD CONSTRAINT "issue_reports_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "app"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."issue_reports" ADD CONSTRAINT "issue_reports_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."issue_reports" ADD CONSTRAINT "issue_reports_resolved_by_profiles_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "app"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."paper_items" ADD CONSTRAINT "paper_items_paper_id_papers_id_fk" FOREIGN KEY ("paper_id") REFERENCES "app"."papers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."paper_items" ADD CONSTRAINT "paper_items_section_id_paper_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "app"."paper_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."paper_items" ADD CONSTRAINT "paper_items_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "app"."questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."paper_sections" ADD CONSTRAINT "paper_sections_paper_id_papers_id_fk" FOREIGN KEY ("paper_id") REFERENCES "app"."papers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."papers" ADD CONSTRAINT "papers_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "app"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."papers" ADD CONSTRAINT "papers_source_document_id_source_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "app"."source_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."question_revisions" ADD CONSTRAINT "question_revisions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "app"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."question_revisions" ADD CONSTRAINT "question_revisions_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "app"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."question_revisions" ADD CONSTRAINT "question_revisions_reviewed_by_profiles_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "app"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."question_topics" ADD CONSTRAINT "question_topics_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "app"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."question_topics" ADD CONSTRAINT "question_topics_topic_id_syllabus_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "app"."syllabus_topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."questions" ADD CONSTRAINT "questions_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "app"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."questions" ADD CONSTRAINT "questions_chapter_id_syllabus_topics_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "app"."syllabus_topics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."questions" ADD CONSTRAINT "questions_paper_id_papers_id_fk" FOREIGN KEY ("paper_id") REFERENCES "app"."papers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."questions" ADD CONSTRAINT "questions_source_document_id_source_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "app"."source_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."questions" ADD CONSTRAINT "questions_published_revision_id_question_revisions_id_fk" FOREIGN KEY ("published_revision_id") REFERENCES "app"."question_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."questions" ADD CONSTRAINT "questions_published_solution_id_solution_revisions_id_fk" FOREIGN KEY ("published_solution_id") REFERENCES "app"."solution_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."questions" ADD CONSTRAINT "questions_published_rubric_id_rubric_revisions_id_fk" FOREIGN KEY ("published_rubric_id") REFERENCES "app"."rubric_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."questions" ADD CONSTRAINT "questions_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "app"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."rubric_criteria" ADD CONSTRAINT "rubric_criteria_rubric_revision_id_rubric_revisions_id_fk" FOREIGN KEY ("rubric_revision_id") REFERENCES "app"."rubric_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."rubric_revisions" ADD CONSTRAINT "rubric_revisions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "app"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."rubric_revisions" ADD CONSTRAINT "rubric_revisions_question_revision_id_question_revisions_id_fk" FOREIGN KEY ("question_revision_id") REFERENCES "app"."question_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."rubric_revisions" ADD CONSTRAINT "rubric_revisions_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "app"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."rubric_revisions" ADD CONSTRAINT "rubric_revisions_reviewed_by_profiles_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "app"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."solution_revisions" ADD CONSTRAINT "solution_revisions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "app"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."solution_revisions" ADD CONSTRAINT "solution_revisions_question_revision_id_question_revisions_id_fk" FOREIGN KEY ("question_revision_id") REFERENCES "app"."question_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."solution_revisions" ADD CONSTRAINT "solution_revisions_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "app"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."solution_revisions" ADD CONSTRAINT "solution_revisions_reviewed_by_profiles_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "app"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."ai_runs" ADD CONSTRAINT "ai_runs_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."attempts" ADD CONSTRAINT "attempts_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."attempts" ADD CONSTRAINT "attempts_paper_id_papers_id_fk" FOREIGN KEY ("paper_id") REFERENCES "app"."papers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."benchmark_runs" ADD CONSTRAINT "benchmark_runs_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "app"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."bookmarks" ADD CONSTRAINT "bookmarks_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."bookmarks" ADD CONSTRAINT "bookmarks_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "app"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."criterion_scores" ADD CONSTRAINT "criterion_scores_evaluation_id_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "app"."evaluations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."criterion_scores" ADD CONSTRAINT "criterion_scores_criterion_id_rubric_criteria_id_fk" FOREIGN KEY ("criterion_id") REFERENCES "app"."rubric_criteria"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."evaluations" ADD CONSTRAINT "evaluations_response_id_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "app"."responses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."evaluations" ADD CONSTRAINT "evaluations_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."evaluations" ADD CONSTRAINT "evaluations_rubric_revision_id_rubric_revisions_id_fk" FOREIGN KEY ("rubric_revision_id") REFERENCES "app"."rubric_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."evaluations" ADD CONSTRAINT "evaluations_transcript_id_transcripts_id_fk" FOREIGN KEY ("transcript_id") REFERENCES "app"."transcripts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."evaluations" ADD CONSTRAINT "evaluations_ai_run_id_ai_runs_id_fk" FOREIGN KEY ("ai_run_id") REFERENCES "app"."ai_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."evaluations" ADD CONSTRAINT "evaluations_evaluator_id_profiles_id_fk" FOREIGN KEY ("evaluator_id") REFERENCES "app"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."examiner_benchmarks" ADD CONSTRAINT "examiner_benchmarks_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "app"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."examiner_benchmarks" ADD CONSTRAINT "examiner_benchmarks_rubric_revision_id_rubric_revisions_id_fk" FOREIGN KEY ("rubric_revision_id") REFERENCES "app"."rubric_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."examiner_benchmarks" ADD CONSTRAINT "examiner_benchmarks_marked_by_profiles_id_fk" FOREIGN KEY ("marked_by") REFERENCES "app"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."extracted_pages" ADD CONSTRAINT "extracted_pages_job_id_ingestion_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "app"."ingestion_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."extraction_candidates" ADD CONSTRAINT "extraction_candidates_job_id_ingestion_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "app"."ingestion_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."extraction_candidates" ADD CONSTRAINT "extraction_candidates_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "app"."questions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."human_review_requests" ADD CONSTRAINT "human_review_requests_evaluation_id_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "app"."evaluations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."human_review_requests" ADD CONSTRAINT "human_review_requests_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."human_review_requests" ADD CONSTRAINT "human_review_requests_resolved_by_profiles_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "app"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."human_review_requests" ADD CONSTRAINT "human_review_requests_teacher_evaluation_id_evaluations_id_fk" FOREIGN KEY ("teacher_evaluation_id") REFERENCES "app"."evaluations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "app"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."responses" ADD CONSTRAINT "responses_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "app"."attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."responses" ADD CONSTRAINT "responses_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."responses" ADD CONSTRAINT "responses_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "app"."questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."responses" ADD CONSTRAINT "responses_question_revision_id_question_revisions_id_fk" FOREIGN KEY ("question_revision_id") REFERENCES "app"."question_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."responses" ADD CONSTRAINT "responses_rubric_revision_id_rubric_revisions_id_fk" FOREIGN KEY ("rubric_revision_id") REFERENCES "app"."rubric_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."responses" ADD CONSTRAINT "responses_paper_item_id_paper_items_id_fk" FOREIGN KEY ("paper_item_id") REFERENCES "app"."paper_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."responses" ADD CONSTRAINT "responses_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "app"."uploads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."solution_reveals" ADD CONSTRAINT "solution_reveals_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."solution_reveals" ADD CONSTRAINT "solution_reveals_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "app"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."solution_reveals" ADD CONSTRAINT "solution_reveals_solution_revision_id_solution_revisions_id_fk" FOREIGN KEY ("solution_revision_id") REFERENCES "app"."solution_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."transcripts" ADD CONSTRAINT "transcripts_response_id_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "app"."responses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."transcripts" ADD CONSTRAINT "transcripts_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."transcripts" ADD CONSTRAINT "transcripts_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "app"."uploads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."transcripts" ADD CONSTRAINT "transcripts_ai_run_id_ai_runs_id_fk" FOREIGN KEY ("ai_run_id") REFERENCES "app"."ai_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."uploads" ADD CONSTRAINT "uploads_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "app"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "app"."audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_created_idx" ON "app"."audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "consent_records_user_idx" ON "app"."consent_records" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "consent_tokens_user_idx" ON "app"."consent_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "source_documents_subject_idx" ON "app"."source_documents" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "syllabus_topics_parent_idx" ON "app"."syllabus_topics" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "content_reviews_content_idx" ON "app"."content_reviews" USING btree ("content_type","content_id");--> statement-breakpoint
CREATE INDEX "issue_reports_status_idx" ON "app"."issue_reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "paper_items_question_idx" ON "app"."paper_items" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "papers_subject_idx" ON "app"."papers" USING btree ("subject_id","publication_status");--> statement-breakpoint
CREATE INDEX "question_revisions_status_idx" ON "app"."question_revisions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "question_topics_topic_idx" ON "app"."question_topics" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "questions_library_idx" ON "app"."questions" USING btree ("publication_status","subject_id","chapter_id");--> statement-breakpoint
CREATE INDEX "questions_source_idx" ON "app"."questions" USING btree ("source_type","exam_year");--> statement-breakpoint
CREATE INDEX "questions_paper_idx" ON "app"."questions" USING btree ("paper_id");--> statement-breakpoint
CREATE INDEX "rubric_revisions_status_idx" ON "app"."rubric_revisions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "solution_revisions_status_idx" ON "app"."solution_revisions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ai_runs_purpose_idx" ON "app"."ai_runs" USING btree ("purpose","created_at");--> statement-breakpoint
CREATE INDEX "ai_runs_user_idx" ON "app"."ai_runs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "attempts_user_idx" ON "app"."attempts" USING btree ("user_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "evaluations_response_idx" ON "app"."evaluations" USING btree ("response_id");--> statement-breakpoint
CREATE INDEX "evaluations_user_idx" ON "app"."evaluations" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "evaluations_method_idx" ON "app"."evaluations" USING btree ("method","status");--> statement-breakpoint
CREATE INDEX "examiner_benchmarks_question_idx" ON "app"."examiner_benchmarks" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "extraction_candidates_job_idx" ON "app"."extraction_candidates" USING btree ("job_id","status");--> statement-breakpoint
CREATE INDEX "human_review_requests_status_idx" ON "app"."human_review_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "responses_user_question_idx" ON "app"."responses" USING btree ("user_id","question_id");--> statement-breakpoint
CREATE INDEX "solution_reveals_user_idx" ON "app"."solution_reveals" USING btree ("user_id","question_id");--> statement-breakpoint
CREATE INDEX "transcripts_response_idx" ON "app"."transcripts" USING btree ("response_id");--> statement-breakpoint
CREATE INDEX "uploads_user_idx" ON "app"."uploads" USING btree ("user_id","created_at");