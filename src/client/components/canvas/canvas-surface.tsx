import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "@excalidraw/excalidraw/index.css";
import { Excalidraw, MainMenu } from "@excalidraw/excalidraw";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type {
  AppState,
  BinaryFiles,
  Collaborator,
  ExcalidrawImperativeAPI,
  SocketId,
} from "@excalidraw/excalidraw/types";
import { Maximize2, Minimize2 } from "lucide-react";
import type { ResolveIdentity } from "@/client/lib/presence-identity";
import { ExcalidrawBinding, type ExcalidrawBindingDeps } from "./excalidraw-binding";
import type { CanvasSessionReadyState } from "./use-canvas-session";
import "./styles/canvas-theme.css";

// Point Excalidraw at same-origin `/fonts/*` (copied by the
// `excalidraw-fonts-copy` Vite plugin into `public/fonts/`). Must be set
// before the Excalidraw bundle resolves any @font-face URL.
declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string;
  }
}
if (typeof window !== "undefined" && !window.EXCALIDRAW_ASSET_PATH) {
  window.EXCALIDRAW_ASSET_PATH = "/";
}

/** SHA-256 hex of a file's bytes. Passed to Excalidraw's `generateIdForFile`
 * so the same image dropped twice deduplicates on fileId naturally (and our
 * yFileRefs mapping gets a stable key). Excalidraw's default is a random
 * nanoid, which is per-drop and wouldn't dedupe. */
async function generateIdForFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface CanvasSurfaceProps {
  session: CanvasSessionReadyState;
  canEdit: boolean;
  canInsertImages: boolean;
  pageId: string;
  workspaceId: string | undefined;
  shareToken: string | undefined;
  resolveIdentity: ResolveIdentity;
  userId: string | null;
}

export function CanvasSurface({
  session,
  canEdit,
  canInsertImages,
  pageId,
  workspaceId,
  shareToken,
  resolveIdentity,
  userId,
}: CanvasSurfaceProps) {
  const { ydoc, yElements, yAppState, yFileRefs, provider } = session;
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [readyApi, setReadyApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [collaborators, setCollaborators] = useState<Map<SocketId, Collaborator>>(() => new Map());
  const [expanded, setExpanded] = useState(false);
  const bindingRef = useRef<ExcalidrawBinding | null>(null);

  // Binding deps live in a ref so the binding reads current values on
  // each event without being re-created when any of them change. A
  // rebuild would cycle awareness (peers see us disconnect + rejoin) and
  // re-hydrate every image from R2. `resolveIdentity` in particular
  // churns on every member add/remove via its memo dependency on the
  // workspace members array.
  const depsRef = useRef<ExcalidrawBindingDeps>({
    workspaceId,
    shareToken,
    pageId,
    canInsertImages,
    userId,
    resolveIdentity,
  });
  depsRef.current = { workspaceId, shareToken, pageId, canInsertImages, userId, resolveIdentity };

  // Escape collapses the expanded overlay. Listener is gated on `expanded`
  // so we don't leak a global keydown handler in the default state.
  useEffect(() => {
    if (!expanded) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [expanded]);

  useEffect(() => {
    if (!api) {
      setReadyApi(null);
      return;
    }
    if (!api.getAppState().isLoading) {
      setReadyApi(api);
      return;
    }
    // Excalidraw flips `isLoading` false after initial asset/font load.
    // Poll lightly on a 50ms timeout — per-frame rAF is wasted work
    // because isLoading doesn't change per frame.
    setReadyApi((current) => (current === api ? current : null));

    let cancelled = false;
    let timer: number | null = null;
    const check = () => {
      if (cancelled) return;
      if (!api.getAppState().isLoading) {
        setReadyApi(api);
        return;
      }
      timer = window.setTimeout(check, 50);
    };
    timer = window.setTimeout(check, 50);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [api]);

  useEffect(() => {
    if (!readyApi) return;
    const binding = new ExcalidrawBinding(readyApi, ydoc, yElements, yAppState, yFileRefs, provider.awareness, {
      onAppStateFromRemote: (partial) => {
        const current = readyApi.getAppState();
        readyApi.updateScene({ appState: { ...current, ...partial } });
      },
      onCollaboratorsChange: (next) => setCollaborators(next),
      getDeps: () => depsRef.current,
    });
    bindingRef.current = binding;
    // Test-only window hooks let Playwright assert on scene state without
    // reading canvas pixels. Gated on DEV so they're stripped from prod
    // bundles via Vite's dead-code elimination — the bland E2E harness
    // runs its own dev server (tests/e2e/harness.ts) so DEV === true there.
    type E2ECanvasWindow = Window & {
      __E2E_CANVAS_SCENE_COUNT__?: () => number;
      __E2E_CANVAS_COLLABORATORS__?: () => Array<{ id: string; pointer?: unknown }>;
    };
    if (import.meta.env.DEV && typeof window !== "undefined") {
      const w = window as E2ECanvasWindow;
      w.__E2E_CANVAS_SCENE_COUNT__ = () =>
        readyApi.getSceneElementsIncludingDeleted().filter((el) => !el.isDeleted).length;
      w.__E2E_CANVAS_COLLABORATORS__ = () => {
        const map = readyApi.getAppState().collaborators;
        const out: Array<{ id: string; pointer?: unknown }> = [];
        map.forEach((c) => out.push({ id: c.id ?? "", pointer: c.pointer }));
        return out;
      };
    }
    return () => {
      binding.destroy();
      bindingRef.current = null;
      if (import.meta.env.DEV && typeof window !== "undefined") {
        const w = window as E2ECanvasWindow;
        delete w.__E2E_CANVAS_SCENE_COUNT__;
        delete w.__E2E_CANVAS_COLLABORATORS__;
      }
    };
  }, [readyApi, ydoc, yElements, yAppState, yFileRefs, provider]);

  // Publish userId changes to awareness without tearing down the binding.
  // In practice userId is stable for a session, but sign-in during an open
  // canvas is possible, and this keeps peers in sync without the cost of
  // rebuilding observers and re-hydrating images.
  useEffect(() => {
    bindingRef.current?.setUserId(userId);
  }, [userId]);

  // Excalidraw reads collaborators from its internal scene state, so push
  // the latest awareness-derived map into the scene whenever it changes.
  useEffect(() => {
    if (!readyApi) return;
    readyApi.updateScene({ collaborators });
  }, [readyApi, collaborators]);

  const handleChange = useCallback(
    (elements: readonly OrderedExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
      bindingRef.current?.handleChange(elements, appState, files);
    },
    [],
  );

  const handlePointerUpdate = useCallback(
    (payload: { pointer: { x: number; y: number }; button: "up" | "down"; pointersMap: Map<number, unknown> }) => {
      bindingRef.current?.handlePointerUpdate(payload);
    },
    [],
  );

  const uiOptions = useMemo(
    () => ({
      canvasActions: {
        changeViewBackgroundColor: canEdit,
        clearCanvas: canEdit,
        loadScene: false,
        saveToActiveFile: false,
        saveAsImage: true,
        export: { saveFileToDisk: true },
        toggleTheme: null,
      },
      tools: { image: canEdit && canInsertImages },
      welcomeScreen: false,
    }),
    [canEdit, canInsertImages],
  );

  // Seed the canvas background for fresh canvases only. Excalidraw's dark
  // theme is implemented as a CSS filter (`invert(93%) hue-rotate(180deg)`),
  // so the input color is not what the user sees on screen — it gets
  // inverted. bland's `--color-accent-50` (warm amethyst-tinted near-white)
  // inverts to a warm near-black, one step lifted from the zinc-950
  // container so the canvas reads as a "paper" surface inside the chrome
  // frame instead of a uniform void.
  //
  // For existing canvases, the ExcalidrawBinding applies the stored
  // `viewBackgroundColor` from Yjs on mount and overrides this default.
  const initialData = useMemo(() => ({ appState: { viewBackgroundColor: "#faf7ff" } }), []);

  // Toggling `expanded` only swaps the container's class + location.
  // Excalidraw stays in the same React subtree so `api`, the binding,
  // and Yjs wiring all survive the transition — no remount. A fixed
  // position is viewport-relative, so ancestor `overflow: hidden` /
  // `contain` on the shell or grid doesn't clip us.
  //
  // The expanded overlay leaves the bland header visible (60px tall,
  // z-50) at the top and keeps a small gutter on the other three sides —
  // full viewport fill would bury the top of the canvas under the
  // header. A dimmed backdrop sits below the canvas (z-30) and collapses
  // on click, same pattern as SummarizeSheet.
  const containerClass = expanded
    ? "bland-canvas fixed inset-x-4 bottom-4 top-[4.5rem] z-40 rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl"
    : "bland-canvas relative mt-6 h-[70vh] rounded-lg border border-zinc-800 bg-zinc-950";
  const ExpandIcon = expanded ? Minimize2 : Maximize2;

  const canvasTree = (
    <div className={containerClass}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-label={expanded ? "Collapse canvas" : "Expand canvas"}
        aria-pressed={expanded}
        title={expanded ? "Collapse canvas (Esc)" : "Expand canvas"}
        className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-md border border-zinc-700/70 bg-zinc-800/70 text-zinc-300 backdrop-blur-sm transition-colors hover:border-zinc-600 hover:bg-zinc-700 hover:text-zinc-100"
      >
        <ExpandIcon className="h-3.5 w-3.5" />
      </button>
      <Excalidraw
        excalidrawAPI={setApi}
        viewModeEnabled={!canEdit}
        onChange={handleChange}
        onPointerUpdate={handlePointerUpdate}
        generateIdForFile={generateIdForFile}
        UIOptions={uiOptions}
        initialData={initialData}
        isCollaborating={collaborators.size > 0}
        theme="dark"
      >
        {/* Always render a custom MainMenu. If we omit it, Excalidraw
         * falls back to its DefaultMainMenu which exposes Help,
         * SearchMenu, and an "Excalidraw links → Socials" group that
         * viewers would see but editors (who get our curated menu)
         * wouldn't — inconsistent, and off-brand for bland. Gating
         * edit-only items inside keeps the menu shape stable across
         * roles: viewers get just Save as image. */}
        <MainMenu>
          <MainMenu.DefaultItems.SaveAsImage />
          {canEdit && <MainMenu.DefaultItems.ClearCanvas />}
          {canEdit && <MainMenu.DefaultItems.ChangeCanvasBackground />}
        </MainMenu>
      </Excalidraw>
    </div>
  );

  // Keep canvasTree in a stable JSX position across expanded/collapsed so
  // React doesn't unmount Excalidraw on toggle — a remount would throw
  // away the imperative API, binding, and hydrated R2 images. Render the
  // backdrop inline as a sibling so it shares the same parent stacking
  // context as the canvas; z-40 > z-30 then resolves deterministically
  // within that context. Portalling the backdrop to body would land it
  // in a different stacking context than the inline canvas, which can
  // flip the paint order (this matches SummarizeSheet's inline pattern).
  return (
    <>
      {expanded && (
        <div className="fixed inset-0 z-30 bg-zinc-950/55" onClick={() => setExpanded(false)} aria-hidden="true" />
      )}
      {canvasTree}
    </>
  );
}
