import { z } from "zod";

/**
 * Rich text source. Plain prose with inline maths in \( … \) and display maths in \[ … \].
 * Blank lines separate paragraphs; **bold** is supported. `$` is never a maths delimiter, so
 * currency (₹) and prose stay unambiguous.
 */
export const RichTextSchema = z.string().trim().min(1);
export type RichText = string;

export const ANSWER_FORMATS = [
  "mcq",
  "short_answer",
  "long_answer",
  "numerical",
  "math_working",
  "structured",
  "diagram",
  "map",
  "passage",
] as const;
export type AnswerFormat = (typeof ANSWER_FORMATS)[number];
/** Formats a single part can take (a part is never itself `structured`). */
export const PART_FORMATS = ANSWER_FORMATS.filter((f) => f !== "structured") as Exclude<AnswerFormat, "structured">[];

// ---------------------------------------------------------------------------------------------
// Diagrams: a small declarative language rendered to SVG. Coordinates are mathematical (y up).
// ---------------------------------------------------------------------------------------------

const Num = z.number().finite();
const PointRef = z.union([z.string().min(1), z.tuple([Num, Num])]);
export type PointRef = z.infer<typeof PointRef>;
const LabelPos = z.enum(["n", "ne", "e", "se", "s", "sw", "w", "nw"]);

const base = {
  /** Solution step at which this element first appears on the whiteboard. Omit = always shown. */
  step: z.number().int().positive().optional(),
  emphasis: z.boolean().optional(),
};

export const DiagramElementSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("point"), id: z.string().min(1), x: Num, y: Num, label: z.string().optional(), labelPos: LabelPos.optional(), hidden: z.boolean().optional(), ...base }),
  z.object({ kind: z.literal("segment"), from: PointRef, to: PointRef, dashed: z.boolean().optional(), label: z.string().optional(), ticks: z.number().int().min(1).max(3).optional(), arrow: z.boolean().optional(), ...base }),
  z.object({ kind: z.literal("line"), through: z.tuple([PointRef, PointRef]), dashed: z.boolean().optional(), label: z.string().optional(), ...base }),
  z.object({ kind: z.literal("circle"), center: PointRef, r: Num.positive(), dashed: z.boolean().optional(), ...base }),
  z.object({ kind: z.literal("arc"), center: PointRef, r: Num.positive(), startDeg: Num, endDeg: Num, dashed: z.boolean().optional(), ...base }),
  z.object({ kind: z.literal("angle"), vertex: PointRef, from: PointRef, to: PointRef, label: z.string().optional(), right: z.boolean().optional(), ...base }),
  z.object({ kind: z.literal("polygon"), points: z.array(PointRef).min(3), shaded: z.boolean().optional(), dashed: z.boolean().optional(), ...base }),
  z.object({ kind: z.literal("polyline"), points: z.array(PointRef).min(2), dashed: z.boolean().optional(), smooth: z.boolean().optional(), ...base }),
  z.object({ kind: z.literal("rect"), x: Num, y: Num, width: Num.positive(), height: Num.positive(), shaded: z.boolean().optional(), label: z.string().optional(), ...base }),
  z.object({ kind: z.literal("text"), at: PointRef, text: z.string().min(1), anchor: z.enum(["start", "middle", "end"]).optional(), ...base }),
]);
export type DiagramElement = z.infer<typeof DiagramElementSchema>;

export const DiagramSchema = z.object({
  id: z.string().min(1),
  /**
   * Required text description of the figure AS SHOWN WITH THE QUESTION (elements without a
   * `step`). It must not describe or hint at the answer.
   */
  alt: z.string().min(10),
  /** Description of what the solution adds (elements with a `step`), read on the whiteboard. */
  solutionAlt: z.string().optional(),
  caption: z.string().optional(),
  viewBox: z.object({ xMin: Num, xMax: Num, yMin: Num, yMax: Num }).refine((v) => v.xMax > v.xMin && v.yMax > v.yMin, "Empty view box"),
  grid: z.boolean().optional(),
  axes: z
    .object({
      x: z.string().optional(),
      y: z.string().optional(),
      xStep: Num.positive().optional(),
      yStep: Num.positive().optional(),
    })
    .optional(),
  /** "Not to scale" disclaimer shown under the figure. */
  notToScale: z.boolean().optional(),
  elements: z.array(DiagramElementSchema).min(1),
});
export type Diagram = z.infer<typeof DiagramSchema>;

// ---------------------------------------------------------------------------------------------
// Question content
// ---------------------------------------------------------------------------------------------

export const OptionSchema = z.object({ key: z.string().regex(/^[a-z]$/), text: RichTextSchema });

export const NumericInputSchema = z.object({
  /** Unit expected in the answer, e.g. "cm²". Omit for pure numbers. */
  unit: z.string().optional(),
  answerLabel: z.string().optional(),
});

export const TableSchema = z.object({
  caption: z.string().optional(),
  headers: z.array(z.string()),
  rows: z.array(z.array(z.string())).min(1),
});

export const QuestionPartSchema = z.object({
  key: z.string().regex(/^[a-z0-9]{1,4}$/),
  marks: z.number().int().min(1).max(20),
  format: z.enum(PART_FORMATS as [string, ...string[]]),
  prompt: RichTextSchema,
  options: z.array(OptionSchema).min(2).optional(),
  numeric: NumericInputSchema.optional(),
  diagramIds: z.array(z.string()).optional(),
});
export type QuestionPart = z.infer<typeof QuestionPartSchema>;

export const QuestionContentSchema = z.object({
  stem: RichTextSchema,
  instructions: z.string().optional(),
  passage: z.string().optional(),
  table: TableSchema.optional(),
  diagrams: z.array(DiagramSchema).optional(),
  options: z.array(OptionSchema).min(2).optional(),
  numeric: NumericInputSchema.optional(),
  parts: z.array(QuestionPartSchema).min(2).optional(),
});
export type QuestionContent = z.infer<typeof QuestionContentSchema>;

// ---------------------------------------------------------------------------------------------
// Answer keys (deterministic grading only) and student answers
// ---------------------------------------------------------------------------------------------

export const SingleKeySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("mcq"), correct: z.string().regex(/^[a-z]$/) }),
  z.object({
    type: z.literal("numeric"),
    value: Num,
    /** Absolute tolerance accepted when comparing the student's value. */
    tolerance: Num.nonnegative(),
    unit: z.string().optional(),
    acceptedUnits: z.array(z.string()).optional(),
  }),
]);
export type SingleKey = z.infer<typeof SingleKeySchema>;

export const AnswerKeySchema = z.union([
  SingleKeySchema,
  z.object({ type: z.literal("parts"), parts: z.record(z.string(), SingleKeySchema) }),
]);
export type AnswerKey = z.infer<typeof AnswerKeySchema>;

export type SingleAnswer = {
  choice?: string;
  value?: string;
  unit?: string;
  text?: string;
};
export type Answer = SingleAnswer & { parts?: Record<string, SingleAnswer> };

export const SingleAnswerSchema = z.object({
  choice: z.string().max(2).optional(),
  value: z.string().max(64).optional(),
  unit: z.string().max(32).optional(),
  text: z.string().max(20000).optional(),
});
export const AnswerSchema = SingleAnswerSchema.extend({
  parts: z.record(z.string().max(8), SingleAnswerSchema).optional(),
});

// ---------------------------------------------------------------------------------------------
// Solutions
// ---------------------------------------------------------------------------------------------

export const SolutionStepSchema = z.object({
  n: z.number().int().positive(),
  partKey: z.string().optional(),
  title: z.string().optional(),
  /** Display maths (LaTeX, no delimiters) written on the board for this step. */
  expression: z.string().optional(),
  explanation: RichTextSchema,
  reason: z.string().optional(),
  rule: z.string().optional(),
  /** Intermediate result in LaTeX, shown boxed. */
  result: z.string().optional(),
  diagramId: z.string().optional(),
  isFinal: z.boolean().optional(),
});
export type SolutionStep = z.infer<typeof SolutionStepSchema>;

export const AlternativeMethodSchema = z.object({
  title: z.string().min(1),
  description: RichTextSchema,
});
export type AlternativeMethod = z.infer<typeof AlternativeMethodSchema>;

export const SolutionSchema = z.object({
  modelAnswer: RichTextSchema,
  finalAnswer: RichTextSchema,
  steps: z.array(SolutionStepSchema).min(1),
  commonMistakes: z.array(RichTextSchema).default([]),
  alternativeMethods: z.array(AlternativeMethodSchema).default([]),
});
export type Solution = z.infer<typeof SolutionSchema>;

// ---------------------------------------------------------------------------------------------
// Rubrics
// ---------------------------------------------------------------------------------------------

export const RubricCriterionSchema = z.object({
  key: z.string().regex(/^[a-z0-9_-]{1,32}$/),
  partKey: z.string().optional(),
  description: z.string().min(3),
  marks: z.number().int().min(1).max(20),
  expectedEvidence: z.string().min(3),
  acceptedAlternatives: z.array(z.string()).default([]),
  partialCreditRules: z.string().optional(),
  commonErrors: z.array(z.string()).default([]),
});
export type RubricCriterion = z.infer<typeof RubricCriterionSchema>;

export const RubricSchema = z.object({
  notes: z.string().optional(),
  criteria: z.array(RubricCriterionSchema).min(1),
});
export type Rubric = z.infer<typeof RubricSchema>;

// ---------------------------------------------------------------------------------------------
// Examiner artefacts
// ---------------------------------------------------------------------------------------------

export type TranscriptSegment = {
  kind: "text" | "math" | "diagram" | "crossed_out" | "final_answer";
  content: string;
  uncertain: boolean;
  note?: string;
};

export type EvaluationSummary = {
  correctElements?: string[];
  missingOrIncorrect?: string[];
  corrections?: string[];
  revisionTopic?: string;
  limitations?: string[];
  overallFeedback?: string;
  humanReviewReason?: string;
};

export type GenerationMeta = {
  method: "ai_assisted_authoring" | "pdf_extraction";
  model?: string;
  promptVersion?: string;
  requestedBy?: string | null;
  createdAt: string;
  note?: string;
  flags?: string[];
  alignmentSources?: string[];
};
