-- Security, integrity and search. Hand-written; reviewed alongside the generated schema.
-- Runs on Supabase and on the PGlite test harness (which stubs auth.uid() and the Supabase roles).

-------------------------------------------------------------------------------------------------
-- Full-text search
-------------------------------------------------------------------------------------------------
ALTER TABLE app.questions
  ADD COLUMN search tsvector GENERATED ALWAYS AS (to_tsvector('english'::regconfig, coalesce(search_text, ''))) STORED;
--> statement-breakpoint
CREATE INDEX questions_search_idx ON app.questions USING gin (search);
--> statement-breakpoint

-------------------------------------------------------------------------------------------------
-- Role helpers. SECURITY DEFINER so policies can consult profiles without recursive RLS.
-------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.has_role(r text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM app.profiles p WHERE p.id = auth.uid() AND r = ANY (p.roles));
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.is_staff() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM app.profiles p
    WHERE p.id = auth.uid() AND p.roles && ARRAY['teacher_reviewer', 'content_editor', 'admin']
  );
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.can_edit_content() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM app.profiles p WHERE p.id = auth.uid() AND p.roles && ARRAY['content_editor', 'admin']
  );
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.can_review_content() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM app.profiles p WHERE p.id = auth.uid() AND p.roles && ARRAY['teacher_reviewer', 'admin']
  );
$$;
--> statement-breakpoint
-- Students may only store attempts and uploads once consent is settled (adult, or guardian consented).
CREATE OR REPLACE FUNCTION app.consent_ok() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM app.profiles p
    WHERE p.id = auth.uid() AND p.consent_status IN ('not_required', 'granted')
  );
$$;
--> statement-breakpoint
-- Reviewers may see a student's response only when that response has been sent for human review.
CREATE OR REPLACE FUNCTION app.response_under_review(rid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM app.human_review_requests h
    JOIN app.evaluations e ON e.id = h.evaluation_id
    WHERE e.response_id = rid
  );
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.owns_response_with_revision(col text, rev uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF col = 'question' THEN
    RETURN EXISTS (SELECT 1 FROM app.responses r WHERE r.user_id = auth.uid() AND r.question_revision_id = rev);
  ELSIF col = 'rubric' THEN
    RETURN EXISTS (SELECT 1 FROM app.responses r WHERE r.user_id = auth.uid() AND r.rubric_revision_id = rev);
  END IF;
  RETURN false;
END;
$$;
--> statement-breakpoint
-- Role changes are admin-only and audited. Exposed as a function so the column grants on
-- profiles can stay narrow for everyone else.
CREATE OR REPLACE FUNCTION app.set_roles(target uuid, new_roles text[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  old_roles text[];
BEGIN
  IF NOT app.has_role('admin') THEN
    RAISE EXCEPTION 'Only administrators can change roles' USING ERRCODE = '42501';
  END IF;
  IF NOT new_roles <@ ARRAY['student', 'teacher_reviewer', 'content_editor', 'admin'] OR cardinality(new_roles) = 0 THEN
    RAISE EXCEPTION 'Invalid roles' USING ERRCODE = '22023';
  END IF;
  IF target = auth.uid() AND NOT ('admin' = ANY (new_roles)) THEN
    RAISE EXCEPTION 'Administrators cannot remove their own admin role' USING ERRCODE = '42501';
  END IF;
  SELECT roles INTO old_roles FROM app.profiles WHERE id = target FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown user' USING ERRCODE = 'P0002';
  END IF;
  UPDATE app.profiles SET roles = new_roles, updated_at = now() WHERE id = target;
  INSERT INTO app.audit_log (actor_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'roles.changed', 'profile', target::text, jsonb_build_object('from', old_roles, 'to', new_roles));
END;
$$;
--> statement-breakpoint

-------------------------------------------------------------------------------------------------
-- Integrity: approved revisions are immutable; approval needs an independent reviewer.
-------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.guard_revision() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  ignored text[] := ARRAY['status', 'submitted_at', 'reviewed_by', 'reviewed_at', 'review_note'];
BEGIN
  IF OLD.status IN ('approved', 'superseded', 'rejected') THEN
    IF (to_jsonb(NEW) - ignored) IS DISTINCT FROM (to_jsonb(OLD) - ignored) THEN
      RAISE EXCEPTION 'Revision % is %, so its content cannot change. Create a new revision instead.', OLD.id, OLD.status
        USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (OLD.status = 'approved' AND NEW.status = 'superseded') THEN
      RAISE EXCEPTION 'Revision % cannot move from % to %', OLD.id, OLD.status, NEW.status USING ERRCODE = '42501';
    END IF;
    IF OLD.status = 'approved' AND (NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at) THEN
      RAISE EXCEPTION 'Approval record of revision % cannot change', OLD.id USING ERRCODE = '42501';
    END IF;
  ELSIF OLD.status = 'in_review' AND NEW.status = 'in_review' THEN
    RAISE EXCEPTION 'Revision % is in review; return it to draft before editing', OLD.id USING ERRCODE = '42501';
  END IF;

  IF NEW.status = 'approved' AND OLD.status <> 'approved' THEN
    IF OLD.status <> 'in_review' THEN
      RAISE EXCEPTION 'Only revisions in review can be approved' USING ERRCODE = '42501';
    END IF;
    IF NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL THEN
      RAISE EXCEPTION 'Approval requires a reviewer and timestamp' USING ERRCODE = '23514';
    END IF;
    IF NEW.created_by IS NOT NULL AND NEW.reviewed_by = NEW.created_by THEN
      RAISE EXCEPTION 'Authors cannot approve their own revisions' USING ERRCODE = '42501';
    END IF;
    IF auth.uid() IS NOT NULL AND (NEW.reviewed_by <> auth.uid() OR NOT app.can_review_content()) THEN
      RAISE EXCEPTION 'Only teacher reviewers or administrators can approve content' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER question_revisions_guard BEFORE UPDATE ON app.question_revisions
  FOR EACH ROW EXECUTE FUNCTION app.guard_revision();
--> statement-breakpoint
CREATE TRIGGER solution_revisions_guard BEFORE UPDATE ON app.solution_revisions
  FOR EACH ROW EXECUTE FUNCTION app.guard_revision();
--> statement-breakpoint
CREATE TRIGGER rubric_revisions_guard BEFORE UPDATE ON app.rubric_revisions
  FOR EACH ROW EXECUTE FUNCTION app.guard_revision();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION app.guard_revision_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'draft' AND current_setting('app.cascade_delete', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Only draft revisions can be deleted' USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER question_revisions_guard_delete BEFORE DELETE ON app.question_revisions
  FOR EACH ROW EXECUTE FUNCTION app.guard_revision_delete();
--> statement-breakpoint
CREATE TRIGGER solution_revisions_guard_delete BEFORE DELETE ON app.solution_revisions
  FOR EACH ROW EXECUTE FUNCTION app.guard_revision_delete();
--> statement-breakpoint
CREATE TRIGGER rubric_revisions_guard_delete BEFORE DELETE ON app.rubric_revisions
  FOR EACH ROW EXECUTE FUNCTION app.guard_revision_delete();
--> statement-breakpoint

-- Criteria can only change while their rubric revision is a draft.
CREATE OR REPLACE FUNCTION app.guard_rubric_criteria() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  rid uuid := COALESCE(NEW.rubric_revision_id, OLD.rubric_revision_id);
  st app.revision_status;
BEGIN
  SELECT status INTO st FROM app.rubric_revisions WHERE id = rid;
  IF st IS NOT NULL AND st <> 'draft' AND current_setting('app.cascade_delete', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Rubric revision % is %, so its criteria cannot change', rid, st USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
--> statement-breakpoint
CREATE TRIGGER rubric_criteria_guard BEFORE INSERT OR UPDATE OR DELETE ON app.rubric_criteria
  FOR EACH ROW EXECUTE FUNCTION app.guard_rubric_criteria();
--> statement-breakpoint

-- A rubric can only be sent for review or approved when its criteria add up to the question's marks.
CREATE OR REPLACE FUNCTION app.check_rubric_totals() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  criteria_sum int;
  criteria_count int;
  question_marks int;
BEGIN
  IF NEW.status IN ('in_review', 'approved') AND OLD.status IS DISTINCT FROM NEW.status THEN
    SELECT COALESCE(sum(marks_available), 0), count(*) INTO criteria_sum, criteria_count
      FROM app.rubric_criteria WHERE rubric_revision_id = NEW.id;
    SELECT marks INTO question_marks FROM app.question_revisions WHERE id = NEW.question_revision_id;
    IF criteria_count = 0 THEN
      RAISE EXCEPTION 'Rubric has no criteria' USING ERRCODE = '23514';
    END IF;
    IF criteria_sum <> NEW.total_marks OR NEW.total_marks <> question_marks THEN
      RAISE EXCEPTION 'Rubric criteria total % but the rubric says % and the question is worth %',
        criteria_sum, NEW.total_marks, question_marks USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER rubric_revisions_totals BEFORE UPDATE ON app.rubric_revisions
  FOR EACH ROW EXECUTE FUNCTION app.check_rubric_totals();
--> statement-breakpoint

-- Publishing rules: approved question + approved solution, rights cleared, provenance for official items.
CREATE OR REPLACE FUNCTION app.guard_question_publication() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  ok boolean;
BEGIN
  IF NEW.publication_status = 'published' THEN
    IF NEW.permission_status NOT IN ('own_content', 'licensed') THEN
      RAISE EXCEPTION 'Question % cannot be published: permission status is %', NEW.code, NEW.permission_status
        USING ERRCODE = '42501';
    END IF;
    IF NEW.source_type <> 'original_practice' AND NEW.source_document_id IS NULL THEN
      RAISE EXCEPTION 'Official question % needs a source document before publishing', NEW.code USING ERRCODE = '23514';
    END IF;
    SELECT EXISTS (SELECT 1 FROM app.question_revisions WHERE id = NEW.published_revision_id
                   AND question_id = NEW.id AND status = 'approved') INTO ok;
    IF NOT ok THEN
      RAISE EXCEPTION 'Question % needs an approved revision to publish', NEW.code USING ERRCODE = '23514';
    END IF;
    SELECT EXISTS (SELECT 1 FROM app.solution_revisions WHERE id = NEW.published_solution_id
                   AND question_id = NEW.id AND status = 'approved') INTO ok;
    IF NOT ok THEN
      RAISE EXCEPTION 'Question % needs an approved solution to publish', NEW.code USING ERRCODE = '23514';
    END IF;
    IF NEW.published_rubric_id IS NOT NULL THEN
      SELECT EXISTS (SELECT 1 FROM app.rubric_revisions WHERE id = NEW.published_rubric_id
                     AND question_id = NEW.id AND status = 'approved') INTO ok;
      IF NOT ok THEN
        RAISE EXCEPTION 'Question % rubric must be approved', NEW.code USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER questions_publication_guard BEFORE INSERT OR UPDATE ON app.questions
  FOR EACH ROW EXECUTE FUNCTION app.guard_question_publication();
--> statement-breakpoint

-- Submitted (locked) answers cannot be edited.
CREATE OR REPLACE FUNCTION app.guard_response() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.locked AND (NEW.answer IS DISTINCT FROM OLD.answer OR NEW.upload_id IS DISTINCT FROM OLD.upload_id OR NOT NEW.locked) THEN
    RAISE EXCEPTION 'This answer has been submitted and can no longer be changed' USING ERRCODE = '42501';
  END IF;
  IF NEW.question_revision_id IS DISTINCT FROM OLD.question_revision_id
     OR NEW.rubric_revision_id IS DISTINCT FROM OLD.rubric_revision_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'A response stays pinned to the revisions it was started with' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER responses_guard BEFORE UPDATE ON app.responses
  FOR EACH ROW EXECUTE FUNCTION app.guard_response();
--> statement-breakpoint

-- Evaluations and criterion scores are append-only.
CREATE OR REPLACE FUNCTION app.forbid_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME USING ERRCODE = '42501';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER evaluations_append_only BEFORE UPDATE ON app.evaluations
  FOR EACH ROW EXECUTE FUNCTION app.forbid_update();
--> statement-breakpoint
CREATE TRIGGER criterion_scores_append_only BEFORE UPDATE ON app.criterion_scores
  FOR EACH ROW EXECUTE FUNCTION app.forbid_update();
--> statement-breakpoint
CREATE TRIGGER audit_log_append_only BEFORE UPDATE ON app.audit_log
  FOR EACH ROW EXECUTE FUNCTION app.forbid_update();
--> statement-breakpoint

-------------------------------------------------------------------------------------------------
-- Grants. RLS below decides which rows each role sees. The app schema is not exposed by
-- Supabase's Data API; these roles are reached only via `SET LOCAL ROLE` from the server.
-------------------------------------------------------------------------------------------------
GRANT USAGE ON SCHEMA app TO anon, authenticated, service_role;
--> statement-breakpoint
GRANT SELECT ON ALL TABLES IN SCHEMA app TO anon, authenticated;
--> statement-breakpoint
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO authenticated;
--> statement-breakpoint
GRANT ALL ON ALL TABLES IN SCHEMA app TO service_role;
--> statement-breakpoint
REVOKE UPDATE ON app.profiles FROM authenticated;
--> statement-breakpoint
GRANT UPDATE (display_name, class_level, preferences, updated_at) ON app.profiles TO authenticated;
--> statement-breakpoint
REVOKE ALL ON app.rate_limits, app.consent_tokens FROM anon, authenticated;
--> statement-breakpoint

-------------------------------------------------------------------------------------------------
-- Row-level security
-------------------------------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'app' LOOP
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- Profiles
CREATE POLICY profiles_select ON app.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR app.has_role('admin'));
--> statement-breakpoint
CREATE POLICY profiles_update ON app.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
--> statement-breakpoint

-- Public catalogue
CREATE POLICY subjects_read ON app.subjects FOR SELECT TO anon, authenticated USING (true);
--> statement-breakpoint
CREATE POLICY subjects_write ON app.subjects FOR ALL TO authenticated
  USING (app.has_role('admin')) WITH CHECK (app.has_role('admin'));
--> statement-breakpoint
CREATE POLICY topics_read ON app.syllabus_topics FOR SELECT TO anon, authenticated USING (true);
--> statement-breakpoint
CREATE POLICY topics_write ON app.syllabus_topics FOR ALL TO authenticated
  USING (app.can_edit_content() OR app.can_review_content())
  WITH CHECK (app.can_edit_content() OR app.can_review_content());
--> statement-breakpoint
CREATE POLICY source_documents_read ON app.source_documents FOR SELECT TO anon, authenticated USING (true);
--> statement-breakpoint
CREATE POLICY source_documents_write ON app.source_documents FOR ALL TO authenticated
  USING (app.can_edit_content() OR app.can_review_content())
  WITH CHECK (app.can_edit_content() OR app.can_review_content());
--> statement-breakpoint
CREATE POLICY policy_versions_read ON app.policy_versions FOR SELECT TO anon, authenticated USING (true);
--> statement-breakpoint

-- Questions: the public sees published questions only; staff see everything.
CREATE POLICY questions_read ON app.questions FOR SELECT TO anon, authenticated
  USING (publication_status = 'published' OR app.is_staff());
--> statement-breakpoint
CREATE POLICY questions_insert ON app.questions FOR INSERT TO authenticated
  WITH CHECK (app.can_edit_content());
--> statement-breakpoint
CREATE POLICY questions_update ON app.questions FOR UPDATE TO authenticated
  USING (app.can_edit_content() OR app.can_review_content())
  WITH CHECK (app.can_edit_content() OR app.can_review_content());
--> statement-breakpoint
CREATE POLICY question_topics_read ON app.question_topics FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM app.questions q WHERE q.id = question_id));
--> statement-breakpoint
CREATE POLICY question_topics_write ON app.question_topics FOR ALL TO authenticated
  USING (app.can_edit_content() OR app.can_review_content())
  WITH CHECK (app.can_edit_content() OR app.can_review_content());
--> statement-breakpoint

CREATE POLICY question_revisions_read ON app.question_revisions FOR SELECT TO anon, authenticated
  USING (
    app.is_staff()
    OR EXISTS (SELECT 1 FROM app.questions q WHERE q.published_revision_id = question_revisions.id AND q.publication_status = 'published')
    OR app.owns_response_with_revision('question', question_revisions.id)
  );
--> statement-breakpoint
CREATE POLICY question_revisions_insert ON app.question_revisions FOR INSERT TO authenticated
  WITH CHECK (app.can_edit_content() AND status = 'draft');
--> statement-breakpoint
CREATE POLICY question_revisions_update ON app.question_revisions FOR UPDATE TO authenticated
  USING (app.can_edit_content() OR app.can_review_content())
  WITH CHECK (app.can_edit_content() OR app.can_review_content());
--> statement-breakpoint
CREATE POLICY question_revisions_delete ON app.question_revisions FOR DELETE TO authenticated
  USING (app.can_edit_content() AND status = 'draft');
--> statement-breakpoint

CREATE POLICY solution_revisions_read ON app.solution_revisions FOR SELECT TO anon, authenticated
  USING (
    app.is_staff()
    OR EXISTS (SELECT 1 FROM app.questions q WHERE q.published_solution_id = solution_revisions.id AND q.publication_status = 'published')
  );
--> statement-breakpoint
CREATE POLICY solution_revisions_insert ON app.solution_revisions FOR INSERT TO authenticated
  WITH CHECK (app.can_edit_content() AND status = 'draft');
--> statement-breakpoint
CREATE POLICY solution_revisions_update ON app.solution_revisions FOR UPDATE TO authenticated
  USING (app.can_edit_content() OR app.can_review_content())
  WITH CHECK (app.can_edit_content() OR app.can_review_content());
--> statement-breakpoint
CREATE POLICY solution_revisions_delete ON app.solution_revisions FOR DELETE TO authenticated
  USING (app.can_edit_content() AND status = 'draft');
--> statement-breakpoint

CREATE POLICY rubric_revisions_read ON app.rubric_revisions FOR SELECT TO anon, authenticated
  USING (
    app.is_staff()
    OR EXISTS (SELECT 1 FROM app.questions q WHERE q.published_rubric_id = rubric_revisions.id AND q.publication_status = 'published')
    OR app.owns_response_with_revision('rubric', rubric_revisions.id)
  );
--> statement-breakpoint
CREATE POLICY rubric_revisions_insert ON app.rubric_revisions FOR INSERT TO authenticated
  WITH CHECK (app.can_edit_content() AND status = 'draft');
--> statement-breakpoint
CREATE POLICY rubric_revisions_update ON app.rubric_revisions FOR UPDATE TO authenticated
  USING (app.can_edit_content() OR app.can_review_content())
  WITH CHECK (app.can_edit_content() OR app.can_review_content());
--> statement-breakpoint
CREATE POLICY rubric_revisions_delete ON app.rubric_revisions FOR DELETE TO authenticated
  USING (app.can_edit_content() AND status = 'draft');
--> statement-breakpoint
CREATE POLICY rubric_criteria_read ON app.rubric_criteria FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM app.rubric_revisions r WHERE r.id = rubric_revision_id));
--> statement-breakpoint
CREATE POLICY rubric_criteria_write ON app.rubric_criteria FOR ALL TO authenticated
  USING (app.can_edit_content()) WITH CHECK (app.can_edit_content());
--> statement-breakpoint

CREATE POLICY content_reviews_read ON app.content_reviews FOR SELECT TO authenticated USING (app.is_staff());
--> statement-breakpoint
CREATE POLICY content_reviews_insert ON app.content_reviews FOR INSERT TO authenticated
  WITH CHECK (reviewer_id = auth.uid() AND (app.can_review_content() OR (app.can_edit_content() AND review_type = 'transcription')));
--> statement-breakpoint

-- Papers
CREATE POLICY papers_read ON app.papers FOR SELECT TO anon, authenticated
  USING (publication_status = 'published' OR app.is_staff());
--> statement-breakpoint
CREATE POLICY papers_write ON app.papers FOR ALL TO authenticated
  USING (app.can_edit_content() OR app.can_review_content())
  WITH CHECK (app.can_edit_content() OR app.can_review_content());
--> statement-breakpoint
CREATE POLICY paper_sections_read ON app.paper_sections FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM app.papers p WHERE p.id = paper_id));
--> statement-breakpoint
CREATE POLICY paper_sections_write ON app.paper_sections FOR ALL TO authenticated
  USING (app.can_edit_content()) WITH CHECK (app.can_edit_content());
--> statement-breakpoint
CREATE POLICY paper_items_read ON app.paper_items FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM app.papers p WHERE p.id = paper_id));
--> statement-breakpoint
CREATE POLICY paper_items_write ON app.paper_items FOR ALL TO authenticated
  USING (app.can_edit_content()) WITH CHECK (app.can_edit_content());
--> statement-breakpoint

-- Issue reports
CREATE POLICY issue_reports_read ON app.issue_reports FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR app.is_staff());
--> statement-breakpoint
CREATE POLICY issue_reports_insert ON app.issue_reports FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'open');
--> statement-breakpoint
CREATE POLICY issue_reports_update ON app.issue_reports FOR UPDATE TO authenticated
  USING (app.is_staff()) WITH CHECK (app.is_staff());
--> statement-breakpoint

-- Audit log: staff read; anyone signed in may append entries attributed to themselves.
CREATE POLICY audit_log_read ON app.audit_log FOR SELECT TO authenticated USING (app.has_role('admin'));
--> statement-breakpoint
CREATE POLICY audit_log_insert ON app.audit_log FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid());
--> statement-breakpoint

-- Consent and deletion records
CREATE POLICY consent_records_read ON app.consent_records FOR SELECT TO authenticated USING (user_id = auth.uid());
--> statement-breakpoint
CREATE POLICY deletion_requests_read ON app.deletion_requests FOR SELECT TO authenticated USING (app.has_role('admin'));
--> statement-breakpoint

-- Student data: own rows only. Writes additionally require settled consent.
CREATE POLICY attempts_own_read ON app.attempts FOR SELECT TO authenticated USING (user_id = auth.uid());
--> statement-breakpoint
CREATE POLICY attempts_own_insert ON app.attempts FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND app.consent_ok());
--> statement-breakpoint
CREATE POLICY attempts_own_update ON app.attempts FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND app.consent_ok());
--> statement-breakpoint
CREATE POLICY attempts_own_delete ON app.attempts FOR DELETE TO authenticated USING (user_id = auth.uid());
--> statement-breakpoint

CREATE POLICY responses_read ON app.responses FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (app.can_review_content() AND app.response_under_review(responses.id)));
--> statement-breakpoint
CREATE POLICY responses_own_insert ON app.responses FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND app.consent_ok()
    AND EXISTS (SELECT 1 FROM app.attempts a WHERE a.id = attempt_id AND a.user_id = auth.uid())
  );
--> statement-breakpoint
CREATE POLICY responses_own_update ON app.responses FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND NOT locked) WITH CHECK (user_id = auth.uid() AND app.consent_ok());
--> statement-breakpoint

CREATE POLICY uploads_read ON app.uploads FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (app.can_review_content() AND EXISTS (
      SELECT 1 FROM app.responses r WHERE r.upload_id = uploads.id AND app.response_under_review(r.id)))
    OR (purpose = 'source_document' AND app.is_staff())
  );
--> statement-breakpoint

CREATE POLICY transcripts_read ON app.transcripts FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (app.can_review_content() AND app.response_under_review(response_id)));
--> statement-breakpoint

CREATE POLICY evaluations_read ON app.evaluations FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (app.can_review_content() AND app.response_under_review(response_id)));
--> statement-breakpoint
-- Students may record their own self-assessment; teachers may add a teacher mark to a response under review.
CREATE POLICY evaluations_self_insert ON app.evaluations FOR INSERT TO authenticated
  WITH CHECK (
    (method = 'self' AND user_id = auth.uid() AND evaluator_id = auth.uid() AND app.consent_ok()
      AND EXISTS (SELECT 1 FROM app.responses r WHERE r.id = response_id AND r.user_id = auth.uid()))
    OR (method = 'teacher' AND evaluator_id = auth.uid() AND app.can_review_content() AND app.response_under_review(response_id))
  );
--> statement-breakpoint
CREATE POLICY criterion_scores_read ON app.criterion_scores FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM app.evaluations e WHERE e.id = evaluation_id));
--> statement-breakpoint
CREATE POLICY criterion_scores_insert ON app.criterion_scores FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM app.evaluations e WHERE e.id = evaluation_id AND e.evaluator_id = auth.uid() AND e.method IN ('self', 'teacher')));
--> statement-breakpoint

CREATE POLICY solution_reveals_own ON app.solution_reveals FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
--> statement-breakpoint
CREATE POLICY bookmarks_own ON app.bookmarks FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
--> statement-breakpoint

CREATE POLICY human_review_read ON app.human_review_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR app.can_review_content());
--> statement-breakpoint
CREATE POLICY human_review_insert ON app.human_review_requests FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND source = 'student' AND status = 'open'
    AND EXISTS (SELECT 1 FROM app.evaluations e WHERE e.id = evaluation_id AND e.user_id = auth.uid())
  );
--> statement-breakpoint
CREATE POLICY human_review_update ON app.human_review_requests FOR UPDATE TO authenticated
  USING (app.can_review_content()) WITH CHECK (app.can_review_content());
--> statement-breakpoint

-- Operations
CREATE POLICY ai_runs_read ON app.ai_runs FOR SELECT TO authenticated USING (app.has_role('admin'));
--> statement-breakpoint
CREATE POLICY ingestion_jobs_staff ON app.ingestion_jobs FOR ALL TO authenticated
  USING (app.can_edit_content() OR app.can_review_content())
  WITH CHECK (app.can_edit_content() OR app.can_review_content());
--> statement-breakpoint
CREATE POLICY extracted_pages_staff ON app.extracted_pages FOR ALL TO authenticated
  USING (app.can_edit_content() OR app.can_review_content())
  WITH CHECK (app.can_edit_content() OR app.can_review_content());
--> statement-breakpoint
CREATE POLICY extraction_candidates_staff ON app.extraction_candidates FOR ALL TO authenticated
  USING (app.can_edit_content() OR app.can_review_content())
  WITH CHECK (app.can_edit_content() OR app.can_review_content());
--> statement-breakpoint
CREATE POLICY benchmarks_read ON app.examiner_benchmarks FOR SELECT TO authenticated USING (app.is_staff());
--> statement-breakpoint
CREATE POLICY benchmarks_write ON app.examiner_benchmarks FOR ALL TO authenticated
  USING (app.can_review_content()) WITH CHECK (app.can_review_content());
--> statement-breakpoint
CREATE POLICY benchmark_runs_read ON app.benchmark_runs FOR SELECT TO authenticated USING (app.is_staff());
--> statement-breakpoint

-------------------------------------------------------------------------------------------------
-- Policy versions referenced by guardian-consent records. The text lives in src/lib/policies.ts.
-------------------------------------------------------------------------------------------------
INSERT INTO app.policy_versions (id, kind, summary, effective_at) VALUES
  ('privacy-2026-10-v1', 'privacy', 'Initial privacy notice', '2026-10-12T00:00:00Z'),
  ('consent-2026-10-v1', 'guardian_consent', 'Initial guardian consent notice', '2026-10-12T00:00:00Z')
ON CONFLICT (id) DO NOTHING;
