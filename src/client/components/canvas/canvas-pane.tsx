import { lazy, Suspense, type ReactNode } from "react";
import type YProvider from "y-partyserver/provider";
import type { PageTitleProps } from "@/client/components/ui/page-title";
import { PageErrorState } from "@/client/components/ui/page-error-state";
import { Skeleton } from "@/client/components/ui/skeleton";
import type { CanvasAffordance } from "@/client/lib/affordance/canvas";
import type { ResolveIdentity } from "@/client/lib/presence-identity";
import { useCanvasSession } from "./use-canvas-session";

const CANVAS_LOAD_ERROR_MESSAGE = "This canvas didn't load. Your connection might be flaky.";

const CanvasSurface = lazy(() => import("./canvas-surface").then((mod) => ({ default: mod.CanvasSurface })));

interface CanvasPageSurfaceProps {
  pageId: string;
  initialTitle: string;
  onTitleChange?: (title: string) => void;
  onProvider?: (provider: YProvider | null) => void;
  shareToken?: string;
  workspaceId?: string;
  affordance: CanvasAffordance;
  resolveIdentity: ResolveIdentity;
  userId: string | null;
  children: (payload: { titleProps: PageTitleProps; body: ReactNode }) => ReactNode;
}

export function CanvasPageSurface({
  pageId,
  initialTitle,
  onTitleChange,
  onProvider,
  shareToken,
  workspaceId,
  affordance,
  resolveIdentity,
  userId,
  children,
}: CanvasPageSurfaceProps) {
  const session = useCanvasSession({
    pageId,
    initialTitle,
    onTitleChange,
    onProvider,
    shareToken,
    workspaceId,
  });

  const titleProps: PageTitleProps = {
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
          resolveIdentity={resolveIdentity}
          userId={userId}
        />
      </Suspense>
    ) : (
      <div className="mx-auto max-w-3xl space-y-3 pl-7">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-3/6" />
      </div>
    );

  return <>{children({ titleProps, body })}</>;
}

function CanvasModuleLoading() {
  return (
    <div className="mt-6 flex h-[70vh] items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950">
      <div className="text-sm text-zinc-500">Loading canvas…</div>
    </div>
  );
}
