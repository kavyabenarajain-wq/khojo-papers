import { and, eq } from "drizzle-orm";
import { z } from "zod";
import * as s from "../db/schema";
import type { Db, Tx } from "../db/types";
import { callStructured, type AiProvider } from "./provider";
import { checkQuestion, DUPLICATE_THRESHOLD, questionSearchText, similarity } from "../content/checks";
import { checkArithmetic } from "../content/arith";
import type { AnswerKey, GenerationMeta, QuestionContent, Rubric, SingleKey, Solution } from "../content/types";
import { createQuestion, saveRubricDraft, saveSolutionDraft } from "../dal/editor";
import type { Actor } from "../dal/review";

export const GENERATE_PROMPT_VERSION = "generate.v1";

export const GENERATE_SYSTEM = `You write ORIGINAL practice questions for ICSE Class 10 Mathematics students, with a complete worked solution and a criterion-level marking rubric. A qualified teacher will review everything before students see it.

Rules:
1. Stay strictly within the given chapter, topic and learning objective.
2. Write an original question. Do not reproduce or lightly paraphrase questions from CISCE board papers, specimen papers or textbooks. Use your own numbers and context.
3. Never claim or imply the question appeared in a real examination, and never cite years, papers or sources.
4. Every number the question needs is stated in it (rates, π values, rounding instructions). No real-world facts presented as current law or rates.
5. Do not write questions that need a figure; describe any geometric situation fully in words.
6. Maths notation: inline \\( … \\), display \\[ … \\]. Never use $ for maths. Use ₹ for rupees. Step "expression" and "result" are raw LaTeX with no delimiters.
7. The solution must be correct and complete. Each step has a short title, what is written, an explanation for a 15-year-old, and the reason or rule. Mark the final step(s) isFinal.
8. The rubric uses method and accuracy criteria whose marks add up EXACTLY to the question's marks (and to each part's marks). State accepted alternatives and partial-credit rules. These are not official marking schemes.
9. Provide "arithmeticChecks": plain arithmetic expressions (numbers, + - * / ^, parentheses, sqrt(), pi, sin/cos/tan in degrees) with their expected values, covering every computed value in the solution and answer key. They will be recomputed automatically.
10. List genuine ambiguities, unsupported assumptions and anything the teacher should double-check in "reviewerFlags". Do not leave it empty just to look confident.`;

const Opt = z.strictObject({ key: z.string(), text: z.string() });
export const GeneratedSchema = z.strictObject({
  stem: z.string(),
  options: z.array(Opt).nullable(),
  parts: z
    .array(z.strictObject({ key: z.string(), marks: z.number().int(), format: z.enum(["mcq", "short_answer", "long_answer", "numerical", "math_working"]), prompt: z.string(), options: z.array(Opt).nullable(), unit: z.string().nullable() }))
    .nullable(),
  unit: z.string().nullable(),
  answerKey: z.strictObject({
    type: z.enum(["mcq", "numeric", "parts", "none"]),
    correctOption: z.string().nullable(),
    value: z.number().nullable(),
    tolerance: z.number().nullable(),
    unit: z.string().nullable(),
    parts: z.array(z.strictObject({ key: z.string(), correctOption: z.string().nullable(), value: z.number().nullable(), tolerance: z.number().nullable(), unit: z.string().nullable() })).nullable(),
  }),
  hints: z.array(z.string()),
  solution: z.strictObject({
    modelAnswer: z.string(),
    finalAnswer: z.string(),
    steps: z.array(z.strictObject({ n: z.number().int(), partKey: z.string().nullable(), title: z.string(), expression: z.string().nullable(), explanation: z.string(), reason: z.string().nullable(), rule: z.string().nullable(), result: z.string().nullable(), isFinal: z.boolean() })),
    commonMistakes: z.array(z.string()),
    alternativeMethods: z.array(z.strictObject({ title: z.string(), description: z.string() })),
  }),
  rubric: z.array(
    z.strictObject({ key: z.string(), partKey: z.string().nullable(), description: z.string(), marks: z.number().int(), expectedEvidence: z.string(), acceptedAlternatives: z.array(z.string()), partialCreditRules: z.string().nullable(), commonErrors: z.array(z.string()) }),
  ),
  arithmeticChecks: z.array(z.strictObject({ expression: z.string(), expected: z.number() })),
  reviewerFlags: z.array(z.string()),
  alignmentNote: z.string().describe("How the question fits the chapter, topic and learning objective."),
});
export type Generated = z.infer<typeof GeneratedSchema>;

export type GenerateRequest = {
  chapterId: string;
  topicId: string | null;
  learningObjective: string;
  difficulty: "easy" | "medium" | "hard";
  marks: number;
  answerFormat: "mcq" | "numerical" | "math_working" | "structured" | "short_answer";
  referenceNotes: string | null;
};

const nn = <T,>(v: T | null): T | undefined => (v === null ? undefined : v);

/** Convert model output to the app's content shapes. */
export function toContent(g: Generated, format: GenerateRequest["answerFormat"], marks: number) {
  const content: QuestionContent = {
    stem: g.stem,
    ...(g.options?.length ? { options: g.options } : {}),
    ...(g.unit ? { numeric: { unit: g.unit } } : {}),
    ...(g.parts?.length
      ? { parts: g.parts.map((p) => ({ key: p.key, marks: p.marks, format: p.format, prompt: p.prompt, ...(p.options?.length ? { options: p.options } : {}), ...(p.unit ? { numeric: { unit: p.unit } } : {}) })) }
      : {}),
  };
  const k = g.answerKey;
  let answerKey: AnswerKey | null = null;
  if (k.type === "mcq" && k.correctOption) answerKey = { type: "mcq", correct: k.correctOption };
  else if (k.type === "numeric" && k.value !== null) answerKey = { type: "numeric", value: k.value, tolerance: k.tolerance ?? 0, unit: nn(k.unit) };
  else if (k.type === "parts" && k.parts?.length) {
    const parts: Record<string, SingleKey> = {};
    for (const p of k.parts) {
      if (p.correctOption) parts[p.key] = { type: "mcq", correct: p.correctOption };
      else if (p.value !== null) parts[p.key] = { type: "numeric", value: p.value, tolerance: p.tolerance ?? 0, unit: nn(p.unit) };
    }
    if (Object.keys(parts).length) answerKey = { type: "parts", parts };
  }
  const solution: Solution = {
    modelAnswer: g.solution.modelAnswer,
    finalAnswer: g.solution.finalAnswer,
    steps: g.solution.steps.map((st) => ({ n: st.n, partKey: nn(st.partKey), title: st.title, expression: nn(st.expression), explanation: st.explanation, reason: nn(st.reason), rule: nn(st.rule), result: nn(st.result), isFinal: st.isFinal })),
    commonMistakes: g.solution.commonMistakes,
    alternativeMethods: g.solution.alternativeMethods,
  };
  const rubric: Rubric = {
    criteria: g.rubric.map((c) => ({ key: c.key, partKey: nn(c.partKey), description: c.description, marks: c.marks, expectedEvidence: c.expectedEvidence, acceptedAlternatives: c.acceptedAlternatives, partialCreditRules: nn(c.partialCreditRules), commonErrors: c.commonErrors })),
  };
  return { content, answerKey, solution, rubric, answerFormat: format, marks };
}

export function validateGenerated(g: Generated, req: Pick<GenerateRequest, "answerFormat" | "marks">): string[] {
  const c = toContent(g, req.answerFormat, req.marks);
  const problems = checkQuestion({ answerFormat: c.answerFormat, marks: c.marks, content: c.content, answerKey: c.answerKey, hints: g.hints, solution: c.solution, rubric: c.rubric })
    .filter((i) => i.level === "error")
    .map((i) => `${i.field}: ${i.message}`);
  if (/\b(19|20)\d{2}\b.*\b(board|icse|cisce|exam|paper)\b|\b(board|icse|cisce)\b.*\b(19|20)\d{2}\b/i.test(g.stem)) problems.push("The question must not mention examination years or papers.");
  if (!g.arithmeticChecks.length && req.answerFormat !== "short_answer") problems.push("Provide arithmetic checks for the computed values.");
  problems.push(...checkArithmetic(g.arithmeticChecks));
  return problems;
}

export async function generateQuestion(deps: { provider: AiProvider; db: Db }, actor: Actor, req: GenerateRequest, code: string) {
  const [chapter] = await deps.db.select().from(s.syllabusTopics).where(and(eq(s.syllabusTopics.id, req.chapterId), eq(s.syllabusTopics.kind, "chapter")));
  if (!chapter) throw new Error("Unknown chapter");
  const [topic] = req.topicId ? await deps.db.select().from(s.syllabusTopics).where(eq(s.syllabusTopics.id, req.topicId)) : [];
  const res = await callStructured<Generated>(deps, {
    purpose: "generate",
    promptVersion: GENERATE_PROMPT_VERSION,
    system: GENERATE_SYSTEM,
    content: [
      {
        type: "text",
        text: `Class: ICSE Class 10 Mathematics (syllabus year ${chapter.syllabusYear}; the syllabus mapping is ${chapter.verificationStatus}).
Chapter: ${chapter.name}${topic ? `\nTopic: ${topic.name}` : ""}
Learning objective: ${req.learningObjective}
Difficulty: ${req.difficulty}
Marks: ${req.marks}
Answer format: ${req.answerFormat}${req.answerFormat === "structured" ? " (2–4 parts whose marks add up to the total)" : ""}${req.answerFormat === "mcq" ? " (four options a–d, 1 mark)" : ""}
${req.referenceNotes ? `Examination conventions or reference notes from the editor (follow, do not copy):\n${req.referenceNotes}` : ""}`,
      },
    ],
    schema: GeneratedSchema,
    schemaName: "generated_question",
    userId: actor.id,
    maxOutputTokens: 6000,
    meta: { chapterId: chapter.id, topicId: topic?.id ?? null, request: req },
    validate: (g) => validateGenerated(g, req),
  });
  if (!res.ok) return { ok: false as const, error: res.error, problems: res.problems ?? [] };

  const c = toContent(res.data, req.answerFormat, req.marks);
  // Near-duplicate detection against the chapter.
  const siblings = await deps.db.select({ code: s.questions.code, text: s.questions.searchText }).from(s.questions).where(eq(s.questions.chapterId, chapter.id));
  const mine = questionSearchText(c.content);
  const dupes = siblings.map((x) => ({ code: x.code, sim: similarity(mine, x.text) })).filter((x) => x.sim >= DUPLICATE_THRESHOLD);
  const generation: GenerationMeta = {
    method: "ai_assisted_authoring",
    model: res.model,
    promptVersion: GENERATE_PROMPT_VERSION,
    requestedBy: actor.id,
    createdAt: new Date().toISOString(),
    note: "Original practice question drafted with AI assistance. Not an official CISCE question. Requires independent teacher review before publication.",
    flags: [...res.data.reviewerFlags, ...dupes.map((d) => `Possible duplicate of ${d.code} (similarity ${d.sim.toFixed(2)})`)],
    alignmentSources: [`Chapter: ${chapter.name}`, ...(topic ? [`Topic: ${topic.name}`] : []), `Alignment: ${res.data.alignmentNote}`],
  };
  const created = await deps.db.transaction(async (tx: Tx) => {
    const { questionId } = await createQuestion(
      tx,
      actor,
      { code, chapterId: chapter.id, sourceType: "original_practice", sourceDocumentId: null, sourcePage: null, sourceQuestionNumber: null, examYear: null, permissionStatus: "own_content" },
      { answerFormat: c.answerFormat, marks: c.marks, difficulty: req.difficulty, content: c.content, answerKey: c.answerKey, hints: res.data.hints, changeNote: "AI-assisted draft" },
      generation,
    );
    if (topic) await tx.insert(s.questionTopics).values({ questionId, topicId: topic.id });
    await saveSolutionDraft(tx, actor, questionId, { ...c.solution, changeNote: "AI-assisted draft" });
    await saveRubricDraft(tx, actor, questionId, { notes: null, criteria: c.rubric.criteria, changeNote: "AI-assisted draft" });
    return questionId;
  });
  return { ok: true as const, questionId: created, duplicates: dupes };
}
