import { z } from "zod";
import {
  ANSWER_FORMATS,
  AnswerKeySchema,
  QuestionContentSchema,
  RubricSchema,
  SolutionSchema,
} from "./types";

export const SeedQuestionSchema = z.object({
  code: z.string().regex(/^M10-[A-Z]{2,4}-\d{3}$/),
  topics: z.array(z.string()).min(1),
  answerFormat: z.enum(ANSWER_FORMATS),
  marks: z.number().int().min(1).max(20),
  difficulty: z.enum(["easy", "medium", "hard"]),
  content: QuestionContentSchema,
  answerKey: AnswerKeySchema.nullable(),
  hints: z.array(z.string().min(1)).default([]),
  solution: SolutionSchema,
  rubric: RubricSchema,
  /** Assumptions, ambiguities or checks a reviewer should look at. */
  authorNotes: z.string().optional(),
});
export type SeedQuestion = z.infer<typeof SeedQuestionSchema>;

export const SeedFileSchema = z.object({
  chapter: z.string(),
  questions: z.array(SeedQuestionSchema).min(1),
});
export type SeedFile = z.infer<typeof SeedFileSchema>;
