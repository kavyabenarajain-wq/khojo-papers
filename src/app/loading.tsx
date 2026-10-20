import { Skeleton } from "@/components/ui/Spinner";

export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-8" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
