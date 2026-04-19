import { Skeleton } from "@/client/components/ui/skeleton";

export function PageLoadingSkeleton() {
  return (
    <div
      className="animate-fade-in mx-auto max-w-3xl px-4 py-10 sm:px-8 lg:grid lg:max-w-[62rem] lg:grid-cols-[minmax(0,48rem)_10rem] lg:gap-4 xl:max-w-[66rem] xl:grid-cols-[minmax(0,48rem)_12rem] xl:gap-6"
      aria-busy="true"
    >
      <div className="min-w-0">
        <div className="-mx-4 -mt-10 mb-6 sm:-mx-8 lg:mx-0">
          <Skeleton className="h-48 w-full rounded-b-lg" />
        </div>
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
      </div>
      <aside className="hidden pt-[5.5rem] lg:block" aria-hidden="true">
        <div className="sticky top-8 space-y-3">
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="ml-3 h-3 w-3/5" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="ml-3 h-3 w-1/2" />
        </div>
      </aside>
    </div>
  );
}
