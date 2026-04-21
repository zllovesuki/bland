import * as Y from "yjs";
import type YProvider from "y-partyserver/provider";
import { getCachedCanvasKey } from "@/client/lib/constants";
import { useDocSyncSession, type DocSyncSessionState } from "@/client/lib/doc-sync-session";
import { YJS_CANVAS_APP_STATE, YJS_CANVAS_ELEMENTS, YJS_CANVAS_FILE_REFS } from "@/shared/constants";

interface CanvasRuntime {
  yElements: Y.Map<Y.Map<unknown>>;
  yAppState: Y.Map<unknown>;
  yFileRefs: Y.Map<string>;
}

export type CanvasSessionState = DocSyncSessionState<CanvasRuntime>;
export type CanvasSessionLoadingState = Extract<CanvasSessionState, { kind: "loading" }>;
export type CanvasSessionReadyState = Extract<CanvasSessionState, { kind: "ready" }>;
export type CanvasSessionErrorState = Extract<CanvasSessionState, { kind: "error" }>;

interface UseCanvasSessionOptions {
  pageId: string;
  initialTitle: string;
  onTitleChange?: (title: string) => void;
  onProvider?: (provider: YProvider | null) => void;
  shareToken?: string;
  workspaceId?: string;
  enabled?: boolean;
}

function canvasRoots(ydoc: Y.Doc): CanvasRuntime {
  return {
    yElements: ydoc.getMap<Y.Map<unknown>>(YJS_CANVAS_ELEMENTS),
    yAppState: ydoc.getMap<unknown>(YJS_CANVAS_APP_STATE),
    yFileRefs: ydoc.getMap<string>(YJS_CANVAS_FILE_REFS),
  };
}

function canvasHasBody({ yElements }: CanvasRuntime): boolean {
  return yElements.size > 0;
}

export function useCanvasSession(opts: UseCanvasSessionOptions): CanvasSessionState {
  return useDocSyncSession<CanvasRuntime>({
    pageId: opts.pageId,
    initialTitle: opts.initialTitle,
    onTitleChange: opts.onTitleChange,
    onProvider: opts.onProvider,
    shareToken: opts.shareToken,
    workspaceId: opts.workspaceId,
    enabled: opts.enabled,
    cacheKey: getCachedCanvasKey(opts.pageId),
    errorSource: "canvas.snapshot-bootstrap",
    roots: canvasRoots,
    hasBody: canvasHasBody,
  });
}
