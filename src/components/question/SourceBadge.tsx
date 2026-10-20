import { Badge } from "@/components/ui/Badge";
import { SOURCE_LABELS } from "@/lib/labels";
import type { SourceType } from "@/lib/dal/library";

export function SourceBadge({ source, year }: { source: SourceType; year?: number | null }) {
  const l = SOURCE_LABELS[source];
  const tone = source === "official_pyq" ? "pyq" : source === "official_specimen" ? "specimen" : "original";
  return (
    <Badge tone={tone} title={l.long}>
      {l.short}
      {year && source !== "original_practice" ? ` ${year}` : ""}
    </Badge>
  );
}
