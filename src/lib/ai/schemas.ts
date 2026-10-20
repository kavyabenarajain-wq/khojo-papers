import { z } from "zod";

/**
 * Structured-output schemas. Strict-mode compatible: every field required, optional values are
 * nullable, objects are closed.
 */

export const RecognitionSchema = z.strictObject({
  legibility: z.enum(["good", "fair", "poor", "unreadable"]).describe("How readable the handwriting is overall."),
  relatesToQuestion: z.enum(["yes", "no", "unsure"]).describe("Whether the page appears to answer the given question."),
  segments: z
    .array(
      z.strictObject({
        kind: z.enum(["text", "math", "diagram", "crossed_out", "final_answer"]),
        content: z.string().describe("Exact transcription. Maths in plain text or LaTeX. For diagrams, a description of what is drawn and labelled."),
        uncertain: z.boolean().describe("True if any character in this segment could not be read with confidence."),
        note: z.string().nullable().describe("Why it is uncertain, or other notes. Null if none."),
      }),
    )
    .describe("The page in reading order."),
  transcript: z.string().describe("The full answer as plain text in reading order, excluding crossed-out work. Mark unreadable parts as [?]."),
  containsPersonalInfo: z.boolean().describe("True if a name, roll number, school or other personal detail is visible."),
  notes: z.string().nullable(),
});
export type Recognition = z.infer<typeof RecognitionSchema>;

export const MISTAKE_CATEGORIES = [
  "conceptual",
  "method",
  "calculation",
  "units",
  "notation",
  "incomplete",
  "missing_reason",
  "misread_question",
  "transcription_suspected",
] as const;

export const MarkingSchema = z.strictObject({
  status: z
    .enum(["evaluated", "needs_review", "cannot_evaluate"])
    .describe("cannot_evaluate if the rubric is unsuitable or the answer is unrelated; needs_review if any mark is genuinely uncertain."),
  criteria: z.array(
    z.strictObject({
      key: z.string().describe("The criterion key exactly as given in the rubric."),
      marksAwarded: z.number().describe("Between 0 and the criterion's marks, in steps of 0.5."),
      evidence: z.string().nullable().describe("A short exact quote from the student's answer that supports the mark. Null when nothing relevant was written."),
      reason: z.string().describe("Why the marks were awarded or withheld, referring to the rubric."),
      alternativeMethod: z.string().nullable().describe("If the student used a valid alternative method, name it. Otherwise null."),
      feedback: z.string().describe("One specific suggestion for the student."),
      uncertain: z.boolean().describe("True if you cannot be confident about this criterion (e.g. unclear transcription)."),
      mistakeCategory: z.enum(MISTAKE_CATEGORIES).nullable().describe("If marks were lost, the kind of mistake. Null if full marks."),
    }),
  ),
  correctElements: z.array(z.string()),
  missingOrIncorrect: z.array(z.string()),
  corrections: z.array(z.string()),
  revisionTopic: z.string().nullable(),
  limitations: z.array(z.string()).describe("Anything that limits this evaluation, e.g. unclear handwriting or a diagram that could not be assessed."),
  overallFeedback: z.string(),
  humanReviewRecommended: z.boolean(),
  humanReviewReason: z.string().nullable(),
  rubricProblem: z.string().nullable().describe("If the rubric is incomplete, contradictory or unsuitable, explain. Otherwise null."),
});
export type Marking = z.infer<typeof MarkingSchema>;
