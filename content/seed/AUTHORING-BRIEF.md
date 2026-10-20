# Authoring brief: original ICSE Class 10 Mathematics practice questions

Seed questions are **original practice material** written for KHOJO PAPERS. They are loaded as
**unpublished drafts in the review queue** and only reach students after a teacher approves the
question, its solution and its rubric. Nothing here is, or may be described as, an official CISCE
question, a previous-year question or a specimen question.

## Rules
1. **Original.** Do not copy or lightly paraphrase questions from board papers, specimen papers or
   textbooks. Use your own numbers, contexts and wording. Keep to the style and difficulty of ICSE
   Class 10, within the chapter and topics listed in `syllabus.json`.
2. **Correct.** Verify every number with a script (e.g. `python3 -c "..."` using `fractions.Fraction`)
   before writing it down: final answers, intermediate results in solution steps, and diagram
   coordinates. If a question has a subtle assumption, state it in the stem or in `authorNotes`.
3. **No invented facts.** Never mention a board year, "board pattern", official marking scheme or
   real GST/interest rates "as fixed by law". Every rate or value a question needs is stated in it.
4. **Maths notation.** Inline maths in `\\( … \\)`, display maths in `\\[ … \\]` (escaped for JSON).
   Never use `$` for maths. Use `₹` for rupees. Step `expression` and `result` are raw LaTeX with no
   delimiters. Prefer `\\tfrac`/`\\frac`, `^\\circ` for degrees, `\\times`, `\\sqrt{}`.
5. **Formats.** `answerFormat` decides the student's input:
   - `mcq`: 1 mark, 4 options `a`–`d`, `answerKey: {"type":"mcq","correct":"b"}`. Distractors should
     reflect real misconceptions (and be explained in `commonMistakes`).
   - `numerical`: the question asks only for a value; marked by the key alone.
     `answerKey: {"type":"numeric","value":…,"tolerance":…,"unit":"cm²"}` and set
     `content.numeric.unit` to the same unit. Tolerance must allow reasonable rounding stated in the
     question (e.g. "correct to 2 decimal places" → tolerance 0.005).
   - `math_working`: marks come from the working (rubric). If there is a single numeric final
     value, also give a numeric `answerKey` (used only to tell the student whether the final value
     matches); otherwise `answerKey: null`.
   - `structured`: 2–4 `parts` (keys `a`,`b`,`c`…), each with its own `format` and `marks`; part
     marks must add up to the question's marks. `answerKey` is `{"type":"parts","parts":{…}}` for the
     objective parts only, or `null`.
   - `short_answer` / `long_answer`: for written reasoning (e.g. "give a reason").
6. **Solutions** are the basis of the step-by-step whiteboard. Each step has `n` (1, 2, 3…),
   a short `title`, an `expression` (what is written on the board), an `explanation` for the student,
   optionally `reason` (why this step), `rule` (theorem or formula), `result` (boxed intermediate
   result) and `partKey` for structured questions. Mark the last step of each part `"isFinal": true`
   where it gives a final answer. `modelAnswer` is the concise answer a strong student would write.
   Include 2–3 `commonMistakes` and any genuine `alternativeMethods`.
7. **Rubrics** are criterion-level, ICSE-style (method marks and accuracy marks). Criteria marks must
   add up to the question's marks (and, for structured questions, to each part's marks; set `partKey`).
   `expectedEvidence` says what an examiner looks for; `acceptedAlternatives` lists equivalent
   answers or methods; `partialCreditRules` says when follow-through or partial credit applies;
   `commonErrors` lists errors that should not earn the mark. Do not claim these are official schemes.
8. **Diagrams** use the declarative spec in `src/lib/content/types.ts` (`DiagramSchema`). Coordinates
   are mathematical (y up) and must be computed so that the figure is geometrically faithful to the
   data (or set `"notToScale": true` and say so). Elements may carry `step` to appear progressively on
   the whiteboard when that solution step is reached; the question page draws only elements WITHOUT
   a `step`, so anything that reveals the answer must have one. `alt` describes only the figure as
   shown with the question and must not reveal the answer; describe what the solution adds in
   `solutionAlt`.
9. **Hints** nudge without giving the answer away (1–2 per question).
10. `authorNotes`: assumptions, anything a reviewer should double-check, and "AI-drafted; requires
    teacher review" is implied for every seed question, so don't repeat it.

## Files
- One file per chapter: `content/seed/maths/<chapter-slug>.json` with shape
  `{"chapter": "<chapter-slug>", "questions": [...]}` (see `src/lib/content/seed-schema.ts`).
- Codes: `M10-<ABBR>-<NNN>`, numbered from 001 per chapter.
- Reference example: `content/seed/FORMAT-EXAMPLE.json`.
- Check with: `npx tsx scripts/check-content.ts content/seed/maths/<file>.json` (must report 0 errors).
