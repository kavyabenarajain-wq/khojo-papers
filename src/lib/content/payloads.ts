import "server-only";
import { renderInline, renderMath, renderRichText } from "./richtext";
import type { Diagram, QuestionContent } from "./types";
import type { RubricDTO, SolutionDTO } from "../dal/questions";

export type WhiteboardStep = {
  n: number;
  title: string | null;
  partKey: string | null;
  expressionHtml: string | null;
  resultHtml: string | null;
  explanationHtml: string;
  reasonHtml: string | null;
  ruleHtml: string | null;
  diagramId: string | null;
  isFinal: boolean;
};

export type WhiteboardPayload = {
  solutionId: string;
  reviewed: boolean;
  steps: WhiteboardStep[];
  diagrams: Diagram[];
  modelAnswerHtml: string;
  finalAnswerHtml: string;
  commonMistakesHtml: string[];
  alternativeMethods: { title: string; html: string }[];
};

/** Pre-render a solution to HTML on the server so the client never needs KaTeX. */
export function buildWhiteboard(solution: SolutionDTO, content: QuestionContent): WhiteboardPayload {
  return {
    solutionId: solution.id,
    reviewed: solution.status === "approved" || solution.status === "superseded",
    steps: solution.steps.map((s) => ({
      n: s.n,
      title: s.title ?? null,
      partKey: s.partKey ?? null,
      expressionHtml: s.expression ? renderMath(s.expression, true) : null,
      resultHtml: s.result ? renderMath(s.result, true) : null,
      explanationHtml: renderRichText(s.explanation),
      reasonHtml: s.reason ? renderRichText(s.reason) : null,
      ruleHtml: s.rule ? renderInline(s.rule) : null,
      diagramId: s.diagramId ?? null,
      isFinal: Boolean(s.isFinal),
    })),
    diagrams: content.diagrams ?? [],
    modelAnswerHtml: renderRichText(solution.modelAnswer),
    finalAnswerHtml: renderRichText(solution.finalAnswer),
    commonMistakesHtml: solution.commonMistakes.map((m) => renderRichText(m)),
    alternativeMethods: solution.alternativeMethods.map((m) => ({ title: m.title, html: renderRichText(m.description) })),
  };
}

export type RubricPayload = {
  id: string;
  totalMarks: number;
  criteria: { key: string; partKey: string | null; descriptionHtml: string; marks: number; evidenceHtml: string; alternatives: string[]; partialCredit: string | null }[];
};

export function buildRubric(r: RubricDTO): RubricPayload {
  return {
    id: r.id,
    totalMarks: r.totalMarks,
    criteria: r.criteria.map((c) => ({
      key: c.key,
      partKey: c.partKey,
      descriptionHtml: renderInline(c.description),
      marks: c.marks,
      evidenceHtml: renderInline(c.expectedEvidence),
      alternatives: c.acceptedAlternatives,
      partialCredit: c.partialCreditRules,
    })),
  };
}

/** Options and part prompts rendered for the client answer panel. */
export type AnswerUi = {
  format: string;
  marks: number;
  optionsHtml: { key: string; html: string }[] | null;
  numericUnit: string | null;
  answerLabel: string | null;
  parts: { key: string; marks: number; format: string; promptHtml: string; optionsHtml: { key: string; html: string }[] | null; numericUnit: string | null }[] | null;
  /** Offer an optional "final value" box (math_working with a single numeric key). */
  finalValue: { unit: string | null } | null;
};

export function buildAnswerUi(format: string, marks: number, content: QuestionContent, hasNumericKey: { unit: string | null } | null): AnswerUi {
  return {
    format,
    marks,
    optionsHtml: content.options?.map((o) => ({ key: o.key, html: renderInline(o.text) })) ?? null,
    numericUnit: content.numeric?.unit ?? null,
    answerLabel: content.numeric?.answerLabel ?? null,
    parts:
      content.parts?.map((p) => ({
        key: p.key,
        marks: p.marks,
        format: p.format,
        promptHtml: renderRichText(p.prompt),
        optionsHtml: p.options?.map((o) => ({ key: o.key, html: renderInline(o.text) })) ?? null,
        numericUnit: p.numeric?.unit ?? null,
      })) ?? null,
    finalValue: format !== "numerical" && format !== "mcq" && format !== "structured" ? hasNumericKey : null,
  };
}
