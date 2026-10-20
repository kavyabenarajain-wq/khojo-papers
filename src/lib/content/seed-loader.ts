import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { and, eq, sql } from "drizzle-orm";
import * as s from "../db/schema";
import type { Db } from "../db/types";
import { SeedFileSchema } from "./seed-schema";
import { questionSearchText } from "./checks";
import type { GenerationMeta } from "./types";

type SyllabusFile = {
  subject: { slug: string; name: string; classLevel: number; syllabusYear: string };
  sourceDocument: {
    title: string;
    documentType: "syllabus";
    sourceUrl: string | null;
    permissionStatus: "reference_only";
    permissionNotes: string;
    knownLimitations: string;
    retrievalDate: string | null;
  };
  units: { unit: string; chapters: { slug: string; name: string; topics: { slug: string; name: string }[] }[] }[];
};

type PapersFile = {
  papers: {
    slug: string;
    title: string;
    durationMinutes: number;
    instructions: string;
    sections: { label: string; instructions?: string; choiceRule: "all" | "any_n"; chooseN?: number; questions: string[] }[];
  }[];
};

export type SeedReport = { subject: string; topics: number; questionsAdded: number; questionsSkipped: number; papersAdded: number };

const SEED_NOTE =
  "Original practice question drafted with AI assistance during the initial build of KHOJO PAPERS. Not an official CISCE question. Requires independent teacher review before publication.";

/**
 * Loads the syllabus, original practice questions and practice sets. Idempotent and additive:
 * an existing question code is never overwritten (corrections go through new revisions).
 * Every question arrives `in_review` and unpublished.
 */
export async function loadSeedContent(db: Db, root = "content/seed"): Promise<SeedReport> {
  const syllabus = JSON.parse(readFileSync(path.join(root, "syllabus.json"), "utf8")) as SyllabusFile;
  const now = new Date();

  return db.transaction(async (tx) => {
    const subj = syllabus.subject;
    await tx
      .insert(s.subjects)
      .values({ slug: subj.slug, name: subj.name, classLevel: subj.classLevel, syllabusYear: subj.syllabusYear, status: "active" })
      .onConflictDoNothing({ target: s.subjects.slug });
    const [subject] = await tx.select().from(s.subjects).where(eq(s.subjects.slug, subj.slug));

    const sd = syllabus.sourceDocument;
    let [doc] = await tx.select().from(s.sourceDocuments).where(eq(s.sourceDocuments.title, sd.title));
    if (!doc) {
      [doc] = await tx
        .insert(s.sourceDocuments)
        .values({
          title: sd.title,
          documentType: sd.documentType,
          subjectId: subject.id,
          classLevel: subj.classLevel,
          syllabusYear: subj.syllabusYear,
          sourceUrl: sd.sourceUrl,
          permissionStatus: sd.permissionStatus,
          permissionNotes: sd.permissionNotes,
          knownLimitations: sd.knownLimitations,
          retrievalDate: sd.retrievalDate,
          verificationStatus: "unverified",
        })
        .returning();
    }

    // Syllabus tree
    const chapterIds = new Map<string, string>();
    const topicIds = new Map<string, string>();
    let position = 0;
    let topicCount = 0;
    for (const unit of syllabus.units) {
      for (const ch of unit.chapters) {
        position++;
        await tx
          .insert(s.syllabusTopics)
          .values({
            subjectId: subject.id,
            kind: "chapter",
            slug: ch.slug,
            unitName: unit.unit,
            name: ch.name,
            syllabusYear: subj.syllabusYear,
            sourceDocumentId: doc.id,
            position,
            verificationStatus: "unverified",
          })
          .onConflictDoNothing();
        const [chapter] = await tx
          .select()
          .from(s.syllabusTopics)
          .where(and(eq(s.syllabusTopics.subjectId, subject.id), eq(s.syllabusTopics.slug, ch.slug)));
        chapterIds.set(ch.slug, chapter.id);
        let tpos = 0;
        for (const t of ch.topics) {
          tpos++;
          topicCount++;
          await tx
            .insert(s.syllabusTopics)
            .values({
              subjectId: subject.id,
              parentId: chapter.id,
              kind: "topic",
              slug: t.slug,
              name: t.name,
              syllabusYear: subj.syllabusYear,
              sourceDocumentId: doc.id,
              position: tpos,
              verificationStatus: "unverified",
            })
            .onConflictDoNothing();
          const [topic] = await tx
            .select()
            .from(s.syllabusTopics)
            .where(and(eq(s.syllabusTopics.subjectId, subject.id), eq(s.syllabusTopics.slug, t.slug)));
          topicIds.set(t.slug, topic.id);
        }
      }
    }

    // Questions
    let added = 0;
    let skipped = 0;
    const dir = path.join(root, "maths");
    const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
    for (const file of files) {
      const parsed = SeedFileSchema.parse(JSON.parse(readFileSync(path.join(dir, file), "utf8")));
      const chapterId = chapterIds.get(parsed.chapter);
      if (!chapterId) throw new Error(`${file}: unknown chapter ${parsed.chapter}`);
      for (const q of parsed.questions) {
        const [existing] = await tx.select({ id: s.questions.id }).from(s.questions).where(eq(s.questions.code, q.code));
        if (existing) {
          skipped++;
          continue;
        }
        const generation: GenerationMeta = {
          method: "ai_assisted_authoring",
          createdAt: now.toISOString(),
          note: SEED_NOTE,
          flags: q.authorNotes ? [q.authorNotes] : [],
        };
        const [question] = await tx
          .insert(s.questions)
          .values({
            code: q.code,
            subjectId: subject.id,
            chapterId,
            sourceType: "original_practice",
            syllabusYear: subj.syllabusYear,
            permissionStatus: "own_content",
            publicationStatus: "draft",
            marks: q.marks,
            answerFormat: q.answerFormat,
            difficulty: q.difficulty,
            difficultyValidated: false,
            searchText: questionSearchText(q.content),
          })
          .returning();
        for (const slug of q.topics) {
          const topicId = topicIds.get(slug);
          if (!topicId) throw new Error(`${q.code}: unknown topic ${slug}`);
          await tx.insert(s.questionTopics).values({ questionId: question.id, topicId });
        }
        const [rev] = await tx
          .insert(s.questionRevisions)
          .values({
            questionId: question.id,
            revisionNumber: 1,
            content: q.content,
            answerFormat: q.answerFormat,
            marks: q.marks,
            answerKey: q.answerKey,
            hints: q.hints,
            difficulty: q.difficulty,
            status: "in_review",
            submittedAt: now,
            changeNote: "Initial draft",
            generation,
          })
          .returning();
        await tx.insert(s.solutionRevisions).values({
          questionId: question.id,
          questionRevisionId: rev.id,
          revisionNumber: 1,
          modelAnswer: q.solution.modelAnswer,
          finalAnswer: q.solution.finalAnswer,
          steps: q.solution.steps,
          commonMistakes: q.solution.commonMistakes,
          alternativeMethods: q.solution.alternativeMethods,
          status: "in_review",
          submittedAt: now,
          changeNote: "Initial draft",
          generation,
        });
        // Criteria can only be written while the rubric is a draft; then it moves to review,
        // which also checks the criteria add up to the question's marks.
        const [rubric] = await tx
          .insert(s.rubricRevisions)
          .values({
            questionId: question.id,
            questionRevisionId: rev.id,
            revisionNumber: 1,
            totalMarks: q.marks,
            notes: q.rubric.notes,
            status: "draft",
            changeNote: "Initial draft",
            generation,
          })
          .returning();
        await tx.insert(s.rubricCriteria).values(
          q.rubric.criteria.map((c, i) => ({
            rubricRevisionId: rubric.id,
            criterionKey: c.key,
            partKey: c.partKey ?? null,
            position: i + 1,
            description: c.description,
            marksAvailable: c.marks,
            expectedEvidence: c.expectedEvidence,
            acceptedAlternatives: c.acceptedAlternatives,
            partialCreditRules: c.partialCreditRules ?? null,
            commonErrors: c.commonErrors,
          })),
        );
        await tx.update(s.rubricRevisions).set({ status: "in_review", submittedAt: now }).where(eq(s.rubricRevisions.id, rubric.id));
        added++;
      }
    }

    // Practice sets (our own papers), unpublished until their questions are published.
    let papersAdded = 0;
    const papersPath = path.join(root, "papers.json");
    let papersFile: PapersFile | null = null;
    try {
      papersFile = JSON.parse(readFileSync(papersPath, "utf8")) as PapersFile;
    } catch {
      papersFile = null;
    }
    for (const p of papersFile?.papers ?? []) {
      const [exists] = await tx.select({ id: s.papers.id }).from(s.papers).where(eq(s.papers.slug, p.slug));
      if (exists) continue;
      const codes = p.sections.flatMap((sec) => sec.questions);
      const qs = await tx
        .select({ id: s.questions.id, code: s.questions.code, marks: s.questions.marks })
        .from(s.questions)
        .where(sql`${s.questions.code} in ${codes}`);
      const byCode = new Map(qs.map((q) => [q.code, q]));
      const missing = codes.filter((c) => !byCode.has(c));
      if (missing.length) throw new Error(`Practice set ${p.slug} refers to unknown questions: ${missing.join(", ")}`);
      let maximum = 0;
      for (const sec of p.sections) {
        const marks = sec.questions.map((c) => byCode.get(c)!.marks ?? 0);
        if (sec.choiceRule === "any_n") {
          if (!sec.chooseN || new Set(marks).size !== 1) throw new Error(`${p.slug}: any_n sections need chooseN and equal marks`);
          maximum += marks[0] * sec.chooseN;
        } else maximum += marks.reduce((a, b) => a + b, 0);
      }
      const [paper] = await tx
        .insert(s.papers)
        .values({
          slug: p.slug,
          subjectId: subject.id,
          title: p.title,
          paperType: "practice_set",
          availability: "hosted",
          syllabusYear: subj.syllabusYear,
          durationMinutes: p.durationMinutes,
          maximumMarks: maximum,
          instructions: p.instructions,
          verificationStatus: "unverified",
          publicationStatus: "draft",
        })
        .returning();
      let itemPos = 0;
      for (const [si, sec] of p.sections.entries()) {
        const [section] = await tx
          .insert(s.paperSections)
          .values({
            paperId: paper.id,
            label: sec.label,
            instructions: sec.instructions,
            position: si + 1,
            choiceRule: sec.choiceRule,
            chooseN: sec.chooseN ?? null,
          })
          .returning();
        for (const code of sec.questions) {
          itemPos++;
          await tx.insert(s.paperItems).values({
            paperId: paper.id,
            sectionId: section.id,
            questionId: byCode.get(code)!.id,
            position: itemPos,
            displayNumber: String(itemPos),
          });
        }
      }
      papersAdded++;
    }

    return { subject: subject.name, topics: topicCount, questionsAdded: added, questionsSkipped: skipped, papersAdded };
  });
}
