import * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";
import { CaptureUpdateAction, reconcileElements } from "@excalidraw/excalidraw";
import type { ExcalidrawElement, FileId, OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type {
  AppState,
  BinaryFileData,
  BinaryFiles,
  Collaborator,
  CollaboratorPointer,
  DataURL,
  ExcalidrawImperativeAPI,
  SocketId,
} from "@excalidraw/excalidraw/types";
import { fetchUploadAsDataURL, uploadFile } from "@/client/lib/uploads";
import { toast } from "@/client/components/toast";
import type { ResolveIdentity } from "@/client/lib/presence-identity";
import { friendlyName } from "@/client/lib/friendly-name";
import { localWinsVersionTiebreak } from "./tiebreak";

const APP_STATE_KEYS = [
  "viewBackgroundColor",
  "currentItemStrokeColor",
  "currentItemBackgroundColor",
  "currentItemFillStyle",
  "currentItemStrokeWidth",
  "currentItemStrokeStyle",
  "currentItemRoughness",
  "currentItemOpacity",
  "currentItemFontFamily",
  "currentItemFontSize",
  "currentItemTextAlign",
  "currentItemStartArrowhead",
  "currentItemEndArrowhead",
  "gridSize",
  "gridModeEnabled",
] as const;

type PersistedAppStateKey = (typeof APP_STATE_KEYS)[number];

/** MIME types Excalidraw renders natively on canvas. The upload route's
 * ALLOWED_UPLOAD_TYPES is a superset (includes application/pdf + image/heic)
 * that doesn't render here; filter at the client so the binding only
 * persists renderable assets. */
const CANVAS_IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

const POINTER_UPDATE_INTERVAL_MS = 50;

export interface ExcalidrawBindingDeps {
  workspaceId: string | undefined;
  shareToken: string | undefined;
  pageId: string;
  canInsertImages: boolean;
  userId: string | null;
  resolveIdentity: ResolveIdentity;
}

export interface ExcalidrawBindingOpts {
  onAppStateFromRemote: (partial: Partial<AppState>) => void;
  onCollaboratorsChange: (collaborators: Map<SocketId, Collaborator>) => void;
  /**
   * Deps are read via a getter so the owning component can update them
   * (e.g. on member list change or online/offline flip) without destroying
   * the binding. A destroy+recreate would tear down awareness and re-fetch
   * every image from R2.
   */
  getDeps: () => ExcalidrawBindingDeps;
}

type ElementMap = Y.Map<unknown>;

function cloneElement(element: OrderedExcalidrawElement): OrderedExcalidrawElement {
  return structuredClone(element);
}

function extractUploadId(url: string): string {
  // /uploads/{id} or /uploads/{id}?share=...
  const match = url.match(/\/uploads\/([^/?]+)/);
  if (!match) throw new Error(`Cannot parse upload id from url: ${url}`);
  return match[1];
}

function mimeToExt(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    default:
      return "bin";
  }
}

function dataURLToBytes(dataURL: string): Uint8Array {
  const base64 = dataURL.replace(/^data:[^,]+,/, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Excalidraw's cursor renderer ignores Collaborator.color and derives the
 * hue from `hashToInteger(collaborator.id ?? socketId) % 37 * 10` at fixed
 * S=100%, L=83%. We set `id` to a single char whose charCode lands on one of
 * six pastel hues chosen to read well against the dark canvas (zinc-950) and
 * stay clear of brand amethyst (~hue 280) and pure yellow (~hue 60).
 *
 *   J (74) → hue 0   (pale coral)
 *   M (77) → hue 30  (pale peach)
 *   S (83) → hue 90  (pale lime)
 *   4 (52) → hue 150 (pale mint)
 *   7 (55) → hue 180 (pale aqua)
 *   E (69) → hue 320 (pale rose)
 */
const CURSOR_ID_BUCKETS = ["J", "M", "S", "4", "7", "E"] as const;

function cursorIdBucket(userId: string | null, clientId: number): string {
  const seed = userId ?? String(clientId);
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return CURSOR_ID_BUCKETS[Math.abs(hash) % CURSOR_ID_BUCKETS.length];
}

export class ExcalidrawBinding {
  private readonly api: ExcalidrawImperativeAPI;
  private readonly ydoc: Y.Doc;
  private readonly yElements: Y.Map<ElementMap>;
  private readonly yAppState: Y.Map<unknown>;
  private readonly yFileRefs: Y.Map<string>;
  private readonly awareness: Awareness;
  private readonly opts: ExcalidrawBindingOpts;
  private readonly lastAppliedVersion = new Map<string, number>();
  private readonly pendingUploads = new Set<string>();
  private readonly hydratedFiles = new Set<string>();
  private readonly elementsObserver: (events: Y.YEvent<ElementMap>[], tx: Y.Transaction) => void;
  private readonly appStateObserver: (event: Y.YMapEvent<unknown>, tx: Y.Transaction) => void;
  private readonly fileRefsObserver: (event: Y.YMapEvent<string>, tx: Y.Transaction) => void;
  private readonly awarenessObserver: () => void;
  private lastSelectedIdsKey: string | null = null;
  private lastPointerAt = 0;
  private dirty = false;
  private rafHandle: number | null = null;
  private appStateDebounce: number | null = null;
  private destroyed = false;
  private fileHydrationErrorShown = false;

  constructor(
    api: ExcalidrawImperativeAPI,
    ydoc: Y.Doc,
    yElements: Y.Map<ElementMap>,
    yAppState: Y.Map<unknown>,
    yFileRefs: Y.Map<string>,
    awareness: Awareness,
    opts: ExcalidrawBindingOpts,
  ) {
    this.api = api;
    this.ydoc = ydoc;
    this.yElements = yElements;
    this.yAppState = yAppState;
    this.yFileRefs = yFileRefs;
    this.awareness = awareness;
    this.opts = opts;

    this.elementsObserver = (_events, tx) => {
      if (tx.origin === this) return;
      this.scheduleRebuild();
    };
    this.appStateObserver = (_event, tx) => {
      if (tx.origin === this) return;
      this.applyRemoteAppState();
    };
    this.fileRefsObserver = (event, tx) => {
      // Our own writes land here too; only react to new additions regardless
      // of origin so local uploads that just resolved get hydrated into the
      // scene for element rendering.
      for (const [fileId, change] of event.changes.keys) {
        if (change.action !== "add") continue;
        const uploadId = this.yFileRefs.get(fileId);
        if (uploadId) void this.hydrateFile(fileId, uploadId);
      }
      // Suppress the tx lint — observer doesn't need it but signature matches
      void tx;
    };
    this.awarenessObserver = () => {
      this.opts.onCollaboratorsChange(this.buildCollaborators());
    };

    yElements.observeDeep(this.elementsObserver);
    yAppState.observe(this.appStateObserver);
    yFileRefs.observe(this.fileRefsObserver);
    awareness.on("change", this.awarenessObserver);

    // Publish local user identity (anonymous for share viewers) and
    // notify the host of the current collaborator set right away so it
    // renders peers that were already present when this binding mounted.
    awareness.setLocalStateField("user", { userId: opts.getDeps().userId });
    this.opts.onCollaboratorsChange(this.buildCollaborators());

    // Seed Excalidraw with any content already in the yElements / yAppState
    // roots at construction time (IDB cache or first WS sync that already
    // landed before the binding mounted).
    this.applyRemoteAppState();
    this.applyRemoteElements();
    void this.hydrateAllFiles();
  }

  /** Fired from Excalidraw's onChange. Writes local wins into yElements,
   * debounces app state, and uploads any new pending image elements. */
  handleChange(elements: readonly OrderedExcalidrawElement[], appState: AppState, files: BinaryFiles): void {
    if (this.destroyed) return;
    this.writeLocalElements(elements);
    this.scheduleAppStateWrite(appState);
    this.handleImageUploads(elements, files);
    this.syncSelectedElementIds(appState);
  }

  /** Fired from Excalidraw's onPointerUpdate — throttle to ~20Hz. */
  handlePointerUpdate(payload: {
    pointer: { x: number; y: number };
    button: "up" | "down";
    pointersMap: Map<number, unknown>;
  }): void {
    if (this.destroyed) return;
    // Skip phantom multi-touch / stylus events where a real pointer isn't the source
    if (payload.pointersMap.size > 1) return;
    const now = Date.now();
    if (now - this.lastPointerAt < POINTER_UPDATE_INTERVAL_MS) return;
    this.lastPointerAt = now;
    const pointer: CollaboratorPointer = {
      x: payload.pointer.x,
      y: payload.pointer.y,
      tool: "pointer",
    };
    this.awareness.setLocalStateField("pointer", pointer);
    this.awareness.setLocalStateField("button", payload.button);
  }

  destroy(): void {
    this.destroyed = true;
    this.yElements.unobserveDeep(this.elementsObserver);
    this.yAppState.unobserve(this.appStateObserver);
    this.yFileRefs.unobserve(this.fileRefsObserver);
    this.awareness.off("change", this.awarenessObserver);
    // Clear our awareness slot so peers see us disconnect promptly
    this.awareness.setLocalState(null);
    if (this.rafHandle !== null) cancelAnimationFrame(this.rafHandle);
    if (this.appStateDebounce !== null) window.clearTimeout(this.appStateDebounce);
  }

  /**
   * Publishes a new userId to awareness without tearing down observers.
   * The owning pane calls this when the local auth user changes — e.g.
   * sign-in during an open session. `getDeps` also exposes this value for
   * peers resolving collaborators on each awareness event, so they
   * converge independently.
   */
  setUserId(userId: string | null): void {
    if (this.destroyed) return;
    this.awareness.setLocalStateField("user", { userId });
  }

  private writeLocalElements(elements: readonly OrderedExcalidrawElement[]): void {
    if (elements.length === 0 && this.yElements.size === 0) return;

    this.ydoc.transact(() => {
      for (const el of elements) {
        const existing = this.yElements.get(el.id);
        const remote = existing ? (existing.get("element") as ExcalidrawElement | undefined) : undefined;
        if (!localWinsVersionTiebreak(el, remote ?? null)) continue;

        if (existing) {
          existing.set("element", cloneElement(el));
        } else {
          const entry = new Y.Map<unknown>();
          this.yElements.set(el.id, entry);
          entry.set("element", cloneElement(el));
        }
      }
    }, this);
  }

  private scheduleRebuild(): void {
    if (this.dirty || this.destroyed) return;
    this.dirty = true;
    this.rafHandle = requestAnimationFrame(() => {
      this.dirty = false;
      this.rafHandle = null;
      if (!this.destroyed) this.applyRemoteElements();
    });
  }

  private collectRemoteElements(): OrderedExcalidrawElement[] {
    const out: OrderedExcalidrawElement[] = [];
    this.yElements.forEach((entry) => {
      const el = entry.get("element") as OrderedExcalidrawElement | undefined;
      if (el) out.push(cloneElement(el));
    });
    // Excalidraw's reconciler assumes fractional-index order; sort so late-
    // arriving inserts land at the correct z-position.
    out.sort((a, b) => {
      const ai = a.index ?? "";
      const bi = b.index ?? "";
      if (ai === bi) return 0;
      return ai < bi ? -1 : 1;
    });
    return out;
  }

  private applyRemoteElements(): void {
    const remote = this.collectRemoteElements();

    // Skip rebuilds where no element version has advanced since the last apply.
    // Covers tombstone-only and awareness-adjacent churn without running
    // reconcileElements + updateScene.
    let anyAdvanced = remote.length !== this.lastAppliedVersion.size;
    if (!anyAdvanced) {
      for (const el of remote) {
        const prior = this.lastAppliedVersion.get(el.id);
        if (prior === undefined || el.version > prior) {
          anyAdvanced = true;
          break;
        }
      }
    }
    if (!anyAdvanced) return;

    const local = this.api.getSceneElementsIncludingDeleted() as readonly OrderedExcalidrawElement[];
    const appState = this.api.getAppState();
    const reconciled = reconcileElements(local, remote as unknown as Parameters<typeof reconcileElements>[1], appState);

    this.lastAppliedVersion.clear();
    for (const el of reconciled) {
      this.lastAppliedVersion.set(el.id, el.version);
    }

    this.api.updateScene({
      elements: reconciled,
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }

  private scheduleAppStateWrite(appState: AppState): void {
    if (this.appStateDebounce !== null) window.clearTimeout(this.appStateDebounce);
    this.appStateDebounce = window.setTimeout(() => {
      this.appStateDebounce = null;
      if (this.destroyed) return;
      this.writeAppState(appState);
    }, 250);
  }

  private writeAppState(appState: AppState): void {
    this.ydoc.transact(() => {
      for (const key of APP_STATE_KEYS) {
        const value = appState[key as keyof AppState];
        if (value === undefined) continue;
        if (this.yAppState.get(key) !== value) {
          this.yAppState.set(key, value);
        }
      }
    }, this);
  }

  private applyRemoteAppState(): void {
    const partial: Partial<AppState> = {};
    let changed = false;
    for (const key of APP_STATE_KEYS) {
      if (!this.yAppState.has(key)) continue;
      (partial as Record<PersistedAppStateKey, unknown>)[key] = this.yAppState.get(key);
      changed = true;
    }
    if (changed) this.opts.onAppStateFromRemote(partial);
  }

  // ------------------------------------------------------------------
  // Image upload + hydration
  // ------------------------------------------------------------------

  private handleImageUploads(elements: readonly OrderedExcalidrawElement[], files: BinaryFiles): void {
    const { workspaceId, canInsertImages } = this.opts.getDeps();
    if (!canInsertImages || !workspaceId) return;

    for (const el of elements) {
      if (el.type !== "image") continue;
      if (el.isDeleted) continue;
      // `status: "pending"` means Excalidraw has the dataURL in `files` but
      // we haven't persisted it yet.
      const status = (el as unknown as { status?: string }).status;
      const fileId = (el as unknown as { fileId?: string }).fileId;
      if (status !== "pending" || !fileId) continue;

      // Three-way guard: don't double-upload.
      if (this.yFileRefs.has(fileId)) continue; // another peer (or us earlier) already persisted
      if (this.pendingUploads.has(fileId)) continue; // this tab has an upload in flight
      const fileData = files[fileId];
      if (!fileData) continue; // bytes aren't materialised yet — wait for next onChange

      void this.uploadImage(fileId, fileData);
    }
  }

  private async uploadImage(fileId: string, fileData: BinaryFileData): Promise<void> {
    const { workspaceId, pageId, shareToken } = this.opts.getDeps();
    if (!workspaceId) return;

    this.pendingUploads.add(fileId);
    try {
      if (!CANVAS_IMAGE_MIMES.has(fileData.mimeType)) {
        toast.error("Only PNG, JPG, GIF, or WebP images are supported on canvas pages");
        this.markImageStatus(fileId, "error");
        return;
      }

      const bytes = dataURLToBytes(fileData.dataURL);
      const ext = mimeToExt(fileData.mimeType);
      // Cast to satisfy TS lib.dom's BlobPart bound — the underlying
      // buffer is always a real ArrayBuffer, never SharedArrayBuffer.
      const file = new File([bytes as BlobPart], `${fileId}.${ext}`, { type: fileData.mimeType });
      const url = await uploadFile(workspaceId, file, pageId, shareToken);
      const uploadId = extractUploadId(url);

      // Only durably record the mapping if no peer has already won the race.
      // The dropped blob on this side becomes R2 garbage that the deferred
      // upload-GC will sweep (see CLAUDE.md).
      if (!this.yFileRefs.has(fileId)) {
        this.ydoc.transact(() => {
          this.yFileRefs.set(fileId, uploadId);
        }, this);
      }

      this.markImageStatus(fileId, "saved");
      // Mark as hydrated — the dataURL we've been holding locally IS the
      // content, no need to re-fetch from the upload URL.
      this.hydratedFiles.add(fileId);
    } catch (err) {
      // Network / 4xx / bad bytes — leave the element as error so the user
      // can see the placeholder and optionally replace.
      this.markImageStatus(fileId, "error");
      void err;
    } finally {
      this.pendingUploads.delete(fileId);
    }
  }

  private markImageStatus(fileId: string, status: "saved" | "error"): void {
    const scene = this.api.getSceneElementsIncludingDeleted();
    let changed = false;
    const next = scene.map((el) => {
      const elFileId = (el as unknown as { fileId?: string }).fileId;
      if (elFileId !== fileId) return el;
      changed = true;
      return { ...el, status } as typeof el;
    });
    if (!changed) return;
    this.api.updateScene({
      elements: next,
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }

  private async hydrateAllFiles(): Promise<void> {
    const entries = Array.from(this.yFileRefs.entries());
    // Chunk in groups of 5 so very image-heavy canvases don't stall the
    // main thread in one burst. FileReader + addFiles are both cheap but
    // the network fetches benefit from a cap.
    const BATCH = 5;
    for (let i = 0; i < entries.length; i += BATCH) {
      if (this.destroyed) return;
      const batch = entries.slice(i, i + BATCH);
      await Promise.all(batch.map(([fileId, uploadId]) => this.hydrateFile(fileId, uploadId)));
    }
  }

  private async hydrateFile(fileId: string, uploadId: string): Promise<void> {
    if (this.destroyed) return;
    if (this.hydratedFiles.has(fileId)) return;
    try {
      const { dataURL, mime } = await fetchUploadAsDataURL(uploadId, this.opts.getDeps().shareToken);
      if (this.destroyed) return;
      const binary: BinaryFileData = {
        id: fileId as FileId,
        dataURL: dataURL as DataURL,
        mimeType: mime as BinaryFileData["mimeType"],
        created: Date.now(),
      };
      this.api.addFiles([binary]);
      this.hydratedFiles.add(fileId);
    } catch (err) {
      if (!this.fileHydrationErrorShown) {
        this.fileHydrationErrorShown = true;
        toast.error("Some canvas images couldn't be loaded");
      }
      void err;
    }
  }

  // ------------------------------------------------------------------
  // Awareness: publish local, build collaborator map for Excalidraw prop
  // ------------------------------------------------------------------

  private syncSelectedElementIds(appState: AppState): void {
    const ids = appState.selectedElementIds;
    const key = Object.keys(ids ?? {})
      .filter((id) => ids[id])
      .sort()
      .join(",");
    if (key === this.lastSelectedIdsKey) return;
    this.lastSelectedIdsKey = key;
    this.awareness.setLocalStateField("selectedElementIds", ids);
  }

  private buildCollaborators(): Map<SocketId, Collaborator> {
    const { resolveIdentity } = this.opts.getDeps();
    const collaborators = new Map<SocketId, Collaborator>();
    for (const [clientId, state] of this.awareness.getStates()) {
      if (clientId === this.awareness.clientID) continue;
      const typed = state as {
        user?: { userId: string | null };
        pointer?: CollaboratorPointer;
        button?: "up" | "down";
        selectedElementIds?: AppState["selectedElementIds"];
      };
      const userId = typed.user?.userId ?? null;
      const identity = resolveIdentity(userId, clientId);
      const socketId = String(clientId) as SocketId;
      collaborators.set(socketId, {
        // See CURSOR_ID_BUCKETS — the single char here steers the cursor hue.
        id: cursorIdBucket(userId, clientId),
        socketId,
        pointer: typed.pointer,
        button: typed.button,
        selectedElementIds: typed.selectedElementIds,
        username: identity.name || friendlyName(String(clientId)),
        avatarUrl: identity.avatar_url ?? undefined,
      });
    }
    return collaborators;
  }
}
