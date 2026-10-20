"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { SlidersHorizontal } from "lucide-react";
import type { LibraryFacets } from "@/lib/dal/library";
import { DIFFICULTY_LABELS, FORMAT_LABELS, SOURCE_LABELS } from "@/lib/labels";
import { Select, Label } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Spinner } from "@/components/ui/Spinner";
import { FILTER_KEYS } from "@/lib/dal/filters";

type Values = Partial<Record<(typeof FILTER_KEYS)[number], string>>;

function Controls({ facets, values, set, signedIn }: { facets: LibraryFacets; values: Values; set: (k: keyof Values, v: string) => void; signedIn: boolean }) {
  const chapter = facets.chapters.find((c) => c.slug === values.chapter);
  const units = Array.from(new Set(facets.chapters.map((c) => c.unit ?? "")));
  const field = (id: keyof Values, label: string, children: React.ReactNode) => (
    <div>
      <Label htmlFor={`f-${id}`}>{label}</Label>
      <Select id={`f-${id}`} value={values[id] ?? ""} onChange={(e) => set(id, e.target.value)}>
        {children}
      </Select>
    </div>
  );
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1.5 text-sm font-medium text-ink">Class and subject</p>
        <p className="text-[0.95rem] text-ink-2">ICSE Class 10 · Mathematics</p>
        <p className="mt-1 text-xs text-ink-3">The only class and subject available so far.</p>
      </div>
      {facets.syllabusYears.length > 1 &&
        field("syllabus", "Syllabus year", (
          <>
            <option value="">All</option>
            {facets.syllabusYears.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </>
        ))}
      {field("chapter", "Chapter", (
        <>
          <option value="">All chapters</option>
          {units.map((u) => (
            <optgroup key={u} label={u}>
              {facets.chapters.filter((c) => (c.unit ?? "") === u).map((c) => (
                <option key={c.slug} value={c.slug} disabled={c.count === 0 && values.chapter !== c.slug}>
                  {c.name} ({c.count})
                </option>
              ))}
            </optgroup>
          ))}
        </>
      ))}
      {chapter && chapter.topics.length > 1 &&
        field("topic", "Topic", (
          <>
            <option value="">All topics</option>
            {chapter.topics.map((t) => (
              <option key={t.slug} value={t.slug}>{t.name}</option>
            ))}
          </>
        ))}
      {field("source", "Question source", (
        <>
          <option value="">All sources</option>
          {facets.sources.map((s) => (
            <option key={s.value} value={s.value} disabled={s.count === 0 && values.source !== s.value}>
              {SOURCE_LABELS[s.value].short} ({s.count})
            </option>
          ))}
        </>
      ))}
      {facets.examYears.length > 0 &&
        field("year", "Examination year", (
          <>
            <option value="">All years</option>
            {facets.examYears.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </>
        ))}
      {field("marks", "Marks", (
        <>
          <option value="">Any</option>
          {facets.marks.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </>
      ))}
      {facets.difficulties.length > 0 &&
        field("difficulty", "Difficulty", (
          <>
            <option value="">Any</option>
            {facets.difficulties.map((d) => (
              <option key={d} value={d}>{DIFFICULTY_LABELS[d as keyof typeof DIFFICULTY_LABELS]}</option>
            ))}
          </>
        ))}
      {field("format", "Question format", (
        <>
          <option value="">Any</option>
          {facets.formats.map((f) => (
            <option key={f} value={f}>{FORMAT_LABELS[f]}</option>
          ))}
        </>
      ))}
      {signedIn ? (
        <>
          {field("status", "Your progress", (
            <>
              <option value="">All questions</option>
              <option value="unattempted">Not attempted yet</option>
              <option value="attempted">Attempted</option>
            </>
          ))}
          {field("saved", "Bookmarks", (
            <>
              <option value="">All questions</option>
              <option value="1">Bookmarked only</option>
            </>
          ))}
        </>
      ) : (
        <p className="text-sm text-ink-3">Sign in to filter by what you have attempted or bookmarked.</p>
      )}
    </div>
  );
}

export function LibraryFilters({ facets, signedIn }: { facets: LibraryFacets; signedIn: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [drawer, setDrawer] = useState(false);
  const current: Values = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) ?? undefined]));
  const [draft, setDraft] = useState<Values>(current);
  const active = FILTER_KEYS.filter((k) => current[k]).length;

  const navigate = (values: Values) => {
    const next = new URLSearchParams();
    const q = params.get("q");
    if (q) next.set("q", q);
    for (const k of FILTER_KEYS) if (values[k]) next.set(k, values[k]!);
    start(() => router.replace(`/explore${next.size ? `?${next}` : ""}`, { scroll: false }));
  };
  const setNow = (k: keyof Values, v: string) => {
    const values = { ...current, [k]: v || undefined, ...(k === "chapter" ? { topic: undefined } : {}) };
    navigate(values);
  };
  const setDraftValue = (k: keyof Values, v: string) =>
    setDraft((d) => ({ ...d, [k]: v || undefined, ...(k === "chapter" ? { topic: undefined } : {}) }));

  return (
    <>
      {/* Phones and tablets: drawer */}
      <div className="flex items-center gap-2 lg:hidden">
        <Button variant="secondary" onClick={() => { setDraft(current); setDrawer(true); }} aria-haspopup="dialog">
          <SlidersHorizontal className="size-4" aria-hidden />
          Filters{active ? ` (${active})` : ""}
        </Button>
        {active > 0 && (
          <Button variant="ghost" onClick={() => navigate({})}>
            Reset
          </Button>
        )}
        {pending && <Spinner className="text-ink-3" label="Updating results" />}
      </div>
      <Dialog
        open={drawer}
        onClose={() => setDrawer(false)}
        title="Filter questions"
        variant="drawer"
        labelledBy="filters-title"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setDraft({})}>
              Reset
            </Button>
            <Button className="flex-1" onClick={() => { navigate(draft); setDrawer(false); }}>
              Show results
            </Button>
          </div>
        }
      >
        <Controls facets={facets} values={draft} set={setDraftValue} signedIn={signedIn} />
      </Dialog>

      {/* Desktop: sidebar, applies immediately */}
      <aside className="hidden lg:block" aria-label="Filters">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Filters</h2>
          <div className="flex items-center gap-2">
            {pending && <Spinner className="text-ink-3" label="Updating results" />}
            {active > 0 && (
              <button type="button" onClick={() => navigate({})} className="min-h-9 rounded px-2 text-sm font-medium text-accent-text hover:underline">
                Reset all
              </button>
            )}
          </div>
        </div>
        <Controls facets={facets} values={current} set={setNow} signedIn={signedIn} />
      </aside>
    </>
  );
}
