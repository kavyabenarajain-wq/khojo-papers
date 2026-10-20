/**
 * Paper totals. For "answer any N" sections, extra answers are handled by our practice-set rule
 * (best N count). That rule is ours, not CISCE's, and is labelled as such in the UI.
 */
export type ItemScore = { itemId: string; marks: number; answered: boolean; awarded: number | null };
export type SectionInput = { id: string; label: string; choiceRule: "all" | "any_n"; chooseN: number | null; items: ItemScore[] };

export type SectionResult = {
  id: string;
  label: string;
  maximum: number;
  awarded: number;
  /** Marks still waiting for rubric marking among the counted items. */
  pending: number;
  countedItemIds: string[];
  answeredCount: number;
  required: number;
  overAttempted: boolean;
  /** Which items count may change once pending items are marked. */
  provisional: boolean;
};

export type PaperResult = { sections: SectionResult[]; maximum: number; awarded: number; pending: number; provisional: boolean };

export function aggregatePaper(sections: SectionInput[]): PaperResult {
  const out = sections.map((s): SectionResult => {
    const required = s.choiceRule === "any_n" ? Math.min(s.chooseN ?? s.items.length, s.items.length) : s.items.length;
    const answered = s.items.filter((i) => i.answered);
    let counted: ItemScore[];
    let provisional = false;
    if (s.choiceRule === "all") {
      counted = s.items;
    } else {
      // Best N among answered items. Unmarked items are ranked by their maximum so we never
      // under-count them; the result is flagged provisional when that ranking matters.
      const ranked = [...answered].sort((a, b) => (b.awarded ?? b.marks) - (a.awarded ?? a.marks));
      counted = ranked.slice(0, required);
      provisional = answered.length > required && ranked.some((i) => i.awarded === null);
    }
    const maximum = s.choiceRule === "all" ? s.items.reduce((a, i) => a + i.marks, 0) : s.items.length ? required * Math.max(...s.items.map((i) => i.marks)) : 0;
    return {
      id: s.id,
      label: s.label,
      maximum,
      awarded: counted.reduce((a, i) => a + (i.answered ? i.awarded ?? 0 : 0), 0),
      pending: counted.reduce((a, i) => a + (i.answered && i.awarded === null ? i.marks : 0), 0),
      countedItemIds: counted.map((i) => i.itemId),
      answeredCount: answered.length,
      required,
      overAttempted: s.choiceRule === "any_n" && answered.length > required,
      provisional,
    };
  });
  return {
    sections: out,
    maximum: out.reduce((a, s) => a + s.maximum, 0),
    awarded: out.reduce((a, s) => a + s.awarded, 0),
    pending: out.reduce((a, s) => a + s.pending, 0),
    provisional: out.some((s) => s.provisional),
  };
}
