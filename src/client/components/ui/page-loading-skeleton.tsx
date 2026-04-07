import { Skeleton } from "@/client/components/ui/skeleton";

export function PageLoadingSkeleton() {
  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-3" />
        <Skeleton className="h-3 w-24" />
      </div>
      <Skeleton className="mb-6 h-10 w-2/3" />
      <div className="space-y-3 pl-7">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-4/6" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/5" />
      </div>
    </>
  );
}
