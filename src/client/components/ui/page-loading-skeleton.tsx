import { Skeleton } from "@/client/components/ui/skeleton";
import type { PageKind } from "@/shared/types";
import {
  CANVAS_PAGE_BODY_CENTERED_CLASS,
  CANVAS_PAGE_BODY_STAGE_CLASS,
  type CanvasStageLayout,
  DOC_PAGE_MAIN_CLASS,
  DOC_PAGE_RAIL_CLASS,
  DOC_PAGE_RAIL_INNER_CLASS,
  PAGE_CONTENT_COLUMN_CLASS,
  PAGE_SHELL_CLASS,
  PAGE_STAGE_CLASS,
  PAGE_STAGE_TRACKS_CLASS,
  PAGE_STAGE_WITH_TRACKS_CLASS,
} from "@/client/components/ui/page-layout";

const OUTLINE_RAIL_ROWS = [
  { indent: 0, width: "w-4/5" },
  { indent: 0.875, width: "w-3/5" },
  { indent: 0.875, width: "w-2/3" },
  { indent: 1.75, width: "w-1/2" },
  { indent: 0, width: "w-3/4" },
];

type LoadingSkeletonKind = PageKind | "unknown";
type DocumentSkeletonLayout = "rail" | "inline";

function PageChromeSkeleton() {
  return (
    <>
      <div className="-mx-4 -mt-10 mb-6 sm:-mx-8 lg:mx-0">
        <Skeleton className="h-48 w-full rounded-b-lg" />
      </div>
      <div className="mb-6 min-h-6">
        <div className="hidden items-center gap-2 md:flex">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-3" />
          <Skeleton className="h-3 w-24" />
        </div>
        <div className="flex items-center gap-2 md:hidden">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-3" />
          <Skeleton className="h-3 w-3" />
        </div>
      </div>
      <div className="mb-4 pl-7">
        <Skeleton className="h-9 w-11 rounded-md" />
      </div>
      <div className="mb-6 pl-4 sm:pl-7">
        <Skeleton className="h-10 w-2/3 sm:h-12" />
      </div>
    </>
  );
}

function RailSkeleton() {
  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <Skeleton className="h-3.5 w-3.5 shrink-0" />
        <Skeleton className="h-2 w-16" />
      </div>
      <ul className="flex flex-col gap-[0.2rem]">
        {OUTLINE_RAIL_ROWS.map((row, i) => (
          <li
            key={i}
            className="flex items-center gap-[0.45rem] py-[0.45rem]"
            style={{ paddingInlineStart: `${row.indent}rem` }}
          >
            <Skeleton className="h-3 w-3 shrink-0" />
            <Skeleton className={`h-3 ${row.width}`} />
          </li>
        ))}
      </ul>
    </>
  );
}

function DocumentBodySkeleton() {
  return (
    <div className="space-y-3 pl-7">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-4 w-4/6" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/5" />
    </div>
  );
}

function CanvasBodySkeleton() {
  return <Skeleton className="h-[70vh] w-full rounded-lg" />;
}

function UnknownBodySkeleton() {
  return (
    <div className="space-y-3 pl-7">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-4 w-4/6" />
    </div>
  );
}

interface PageLoadingSkeletonProps {
  canvasLayout?: CanvasStageLayout;
  kind?: LoadingSkeletonKind;
  documentLayout?: DocumentSkeletonLayout;
}

export function PageLoadingSkeleton({
  canvasLayout = "centered",
  kind = "doc",
  documentLayout = "rail",
}: PageLoadingSkeletonProps) {
  if (kind === "canvas") {
    return (
      <div className={PAGE_SHELL_CLASS} aria-busy="true">
        <div className={PAGE_STAGE_CLASS}>
          {canvasLayout === "stage" ? (
            <>
              <div className={PAGE_STAGE_TRACKS_CLASS}>
                <div className="min-w-0">
                  <div className={PAGE_CONTENT_COLUMN_CLASS}>
                    <PageChromeSkeleton />
                  </div>
                </div>
              </div>
              <div className={CANVAS_PAGE_BODY_STAGE_CLASS}>
                <CanvasBodySkeleton />
              </div>
            </>
          ) : (
            <div className="min-w-0">
              <div className={PAGE_CONTENT_COLUMN_CLASS}>
                <PageChromeSkeleton />
              </div>
              <div className={CANVAS_PAGE_BODY_CENTERED_CLASS}>
                <CanvasBodySkeleton />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (kind === "unknown") {
    return (
      <div className={PAGE_SHELL_CLASS} aria-busy="true">
        <div className={PAGE_STAGE_CLASS}>
          <div className="min-w-0">
            <div className={PAGE_CONTENT_COLUMN_CLASS}>
              <PageChromeSkeleton />
              <UnknownBodySkeleton />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (documentLayout === "inline") {
    return (
      <div className={PAGE_SHELL_CLASS} aria-busy="true">
        <div className={PAGE_STAGE_CLASS}>
          <div className="min-w-0">
            <div className={PAGE_CONTENT_COLUMN_CLASS}>
              <PageChromeSkeleton />
              <DocumentBodySkeleton />
              <div className="mt-8">
                <RailSkeleton />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={PAGE_SHELL_CLASS} aria-busy="true">
      <div className={PAGE_STAGE_WITH_TRACKS_CLASS}>
        <div className={DOC_PAGE_MAIN_CLASS}>
          <div className={PAGE_CONTENT_COLUMN_CLASS}>
            <PageChromeSkeleton />
            <DocumentBodySkeleton />
          </div>
        </div>
        <aside className={DOC_PAGE_RAIL_CLASS} aria-hidden="true">
          <div className={DOC_PAGE_RAIL_INNER_CLASS}>
            <RailSkeleton />
          </div>
        </aside>
      </div>
    </div>
  );
}
