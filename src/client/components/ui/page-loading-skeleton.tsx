import { Skeleton } from "@/client/components/ui/skeleton";

export function PageLoadingSkeleton() {
  return (
    <>
      <div className="mb-6 flex items-center gap-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-3" />
        <Skeleton className="h-3 w-24" />
      </div>
      <div className="mb-4 pl-7">
        <Skeleton className="h-7 w-7 rounded-md" />
      </div>
      <div className="mb-6 pl-4 sm:pl-7">
        <Skeleton className="h-10 w-2/3 sm:h-12" />
      </div>
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
