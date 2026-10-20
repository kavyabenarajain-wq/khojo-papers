import { z } from "zod";
import { ANSWER_FORMATS } from "../content/types";
import { DIFFICULTIES, SOURCE_TYPES, type LibraryFilters } from "./library";

const str = z.string().trim().max(120).optional().catch(undefined);
const slug = z.string().regex(/^[a-z0-9-]{1,64}$/).optional().catch(undefined);
const int = z.coerce.number().int().min(1).max(3000).optional().catch(undefined);

const schema = z.object({
  q: str,
  syllabus: z.string().regex(/^[0-9-]{4,9}$/).optional().catch(undefined),
  chapter: slug,
  topic: slug,
  source: z.enum(SOURCE_TYPES).optional().catch(undefined),
  year: int,
  marks: int,
  difficulty: z.enum(DIFFICULTIES).optional().catch(undefined),
  format: z.enum(ANSWER_FORMATS).optional().catch(undefined),
  status: z.enum(["attempted", "unattempted"]).optional().catch(undefined),
  saved: z.literal("1").optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(500).optional().catch(undefined),
});

export type ParsedFilters = { filters: LibraryFilters; page: number };

/** Untrusted URL params → validated filters. Invalid values are dropped, never passed to SQL. */
export function parseLibraryParams(params: Record<string, string | string[] | undefined>): ParsedFilters {
  const flat = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const p = schema.parse(flat);
  return {
    filters: {
      q: p.q || undefined,
      syllabusYear: p.syllabus,
      chapter: p.chapter,
      topic: p.topic,
      source: p.source,
      year: p.year,
      marks: p.marks,
      difficulty: p.difficulty,
      format: p.format,
      status: p.status,
      bookmarked: p.saved === "1",
    },
    page: p.page ?? 1,
  };
}

export const FILTER_KEYS = ["syllabus", "chapter", "topic", "source", "year", "marks", "difficulty", "format", "status", "saved"] as const;
