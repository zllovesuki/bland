import { lazy, Suspense, type ReactNode } from "react";
import type YProvider from "y-partyserver/provider";
import { PageErrorState } from "@/client/components/ui/page-error-state";
import { PageTitleSection } from "@/client/components/ui/page-title-section";
import { Skeleton } from "@/client/components/ui/skeleton";
import {
  CANVAS_PAGE_BODY_CENTERED_CLASS,
  CANVAS_PAGE_BODY_STAGE_CLASS,
  type CanvasStageLayout,
  PAGE_SHELL_CLASS,
  PAGE_STAGE_CLASS,
  PAGE_STAGE_TRACKS_CLASS,
} from "@/client/components/ui/page-layout";
import type { CanvasAffordance } from "@/client/lib/affordance/canvas";
import { useCanvasSession } from "./use-canvas-session";

const CANVAS_LOAD_ERROR_MESSAGE = "This canvas didn't load. Your connection might be flaky.";

const CanvasSurface = lazy(() => import("./canvas-surface").then((mod) => ({ default: mod.CanvasSurface })));

interface CanvasPageProps {
  pageId: string;
  initialTitle: string;
  onTitleChange?: (title: string) => void;
  onProvider?: (provider: YProvider | null) => void;
  shareToken?: string;
  workspaceId?: string;
  affordance: CanvasAffordance;
  layout?: CanvasStageLayout;
  chrome: ReactNode;
}

export function CanvasPage({
  pageId,
  initialTitle,
  onTitleChange,
  onProvider,
  shareToken,
  workspaceId,
  affordance,
  layout = "centered",
  chrome,
}: CanvasPageProps) {
  const session = useCanvasSession({
    pageId,
    initialTitle,
    onTitleChange,
    onProvider,
    shareToken,
    workspaceId,
  });

  const titleProps = {
    title: session.title,
    onInput: session.onTitleInput,
    disabled: session.kind !== "ready",
    readOnly: !affordance.canEdit,
  };

  const body =
    session.kind === "error" ? (
      <div className="mx-auto max-w-3xl">
        <PageErrorState
          message={CANVAS_LOAD_ERROR_MESSAGE}
          className="min-h-[12rem]"
          action={{ label: "Retry", onClick: session.onRetry }}
        />
      </div>
    ) : session.kind === "ready" ? (
      <Suspense fallback={<CanvasModuleLoading />}>
        <CanvasSurface
          session={session}
          canEdit={affordance.canEdit}
          canInsertImages={affordance.canInsertImages}
          pageId={pageId}
          workspaceId={workspaceId}
          shareToken={shareToken}
        />
      </Suspense>
    ) : (
      <div className="mx-auto max-w-3xl space-y-3 pl-7">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-3/6" />
      </div>
    );

  return (
    <div className={PAGE_SHELL_CLASS}>
      <div className={PAGE_STAGE_CLASS}>
        <div className={layout === "stage" ? PAGE_STAGE_TRACKS_CLASS : undefined}>
          <div className="min-w-0">
            {chrome}
            <PageTitleSection {...titleProps} />
          </div>
        </div>
        <div className={layout === "stage" ? CANVAS_PAGE_BODY_STAGE_CLASS : CANVAS_PAGE_BODY_CENTERED_CLASS}>
          {body}
        </div>
      </div>
    </div>
  );
}

function CanvasModuleLoading() {
  return (
    <div className="mt-6 flex h-[70vh] items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950">
      <div className="text-sm text-zinc-500">Loading canvas…</div>
    </div>
  );
}
