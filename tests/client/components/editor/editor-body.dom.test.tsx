import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";
import type { ResolveIdentity } from "@/client/lib/presence-identity";
import type { AwarenessState } from "@/client/hooks/use-sync";
import type { EditorAffordance } from "@/client/lib/affordance/editor";

const affordance: EditorAffordance = {
  documentEditable: true,
  canInsertPageMentions: true,
  canInsertImages: true,
  canUseAiRewrite: true,
  canUseAiGenerate: true,
  canSummarizePage: true,
  canAskPage: true,
};

type AwarenessListener = () => void;

class FakeAwareness {
  readonly clientID = 1;
  readonly states = new Map<number, AwarenessState>([[this.clientID, {}]]);
  private readonly listeners = new Map<string, Set<AwarenessListener>>();

  getLocalState(): AwarenessState | null {
    return this.states.get(this.clientID) ?? null;
  }

  getStates(): Map<number, AwarenessState> {
    return this.states;
  }

  setLocalState(state: AwarenessState | null): void {
    if (state === null) {
      this.states.delete(this.clientID);
    } else {
      this.states.set(this.clientID, state);
    }
    this.emit("change");
    this.emit("update");
  }

  setLocalStateField(field: string, value: unknown): void {
    const state = this.getLocalState();
    if (state === null) return;
    this.setLocalState({ ...state, [field]: value });
  }

  on(event: string, listener: AwarenessListener): void {
    const listeners = this.listeners.get(event) ?? new Set<AwarenessListener>();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }

  off(event: string, listener: AwarenessListener): void {
    this.listeners.get(event)?.delete(listener);
  }

  private emit(event: string): void {
    for (const listener of this.listeners.get(event) ?? []) listener();
  }
}

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("EditorBody", () => {
  it("does not notify awareness subscribers while rendering", async () => {
    vi.doMock("@/client/lib/collab-identity", () => ({
      useCollabIdentity: () => ({
        userId: "user-local",
        resolveIdentity: () => ({ name: "Local user", avatar_url: null }),
      }),
    }));
    vi.doMock("@/client/components/editor/controllers/drag-handle", () => ({ DragHandle: () => null }));
    vi.doMock("@/client/components/editor/controllers/formatting-toolbar", () => ({ FormattingToolbar: () => null }));
    vi.doMock("@/client/components/editor/controllers/link-toolbar", () => ({ LinkToolbar: () => null }));
    vi.doMock("@/client/components/editor/controllers/image/toolbar", () => ({ ImageToolbar: () => null }));
    vi.doMock("@/client/components/editor/controllers/table-menu", () => ({ TableMenu: () => null }));
    vi.doMock("@/client/components/editor/editor-metrics", () => ({ EditorMetrics: () => null }));
    vi.doMock("@/client/components/editor/editor-outline", () => ({ EditorOutline: () => null }));
    vi.doMock("@/client/components/editor/extensions/create-editor-extensions", async () => {
      const [{ StarterKit }, { Collaboration }, { createCollaborationCaret }] = await Promise.all([
        vi.importActual<typeof import("@tiptap/starter-kit")>("@tiptap/starter-kit"),
        vi.importActual<typeof import("@tiptap/extension-collaboration")>("@tiptap/extension-collaboration"),
        vi.importActual<typeof import("@/client/components/editor/extensions/collaboration-caret")>(
          "@/client/components/editor/extensions/collaboration-caret",
        ),
      ]);

      return {
        createEditorExtensions: (opts: {
          fragment: Y.XmlFragment;
          provider: { awareness: Awareness };
          user: { userId: string | null };
          resolveIdentity: ResolveIdentity;
        }) => [
          StarterKit.configure({ undoRedo: false }),
          Collaboration.configure({ fragment: opts.fragment }),
          createCollaborationCaret({
            provider: opts.provider,
            user: opts.user,
            resolveIdentity: opts.resolveIdentity,
          }),
        ],
      };
    });

    const [{ EditorBody }, { useAwareness }] = await Promise.all([
      import("@/client/components/editor/editor-body"),
      import("@/client/hooks/use-sync"),
    ]);

    const ydoc = new Y.Doc();
    const awareness = new FakeAwareness() as unknown as Awareness;
    const provider = { awareness };
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    function AwarenessSubscriber() {
      const states = useAwareness(awareness);
      return <output>{states.size}</output>;
    }

    function Harness() {
      return (
        <>
          <AwarenessSubscriber />
          <EditorBody
            fragment={ydoc.getXmlFragment("default")}
            provider={provider}
            pageId="page-1"
            workspaceId="workspace-1"
            affordance={affordance}
          />
        </>
      );
    }

    const host = document.createElement("div");
    document.body.appendChild(host);
    let root: Root | null = createRoot(host);

    try {
      await act(async () => {
        root!.render(<Harness />);
      });
      await act(async () => {
        await Promise.resolve();
      });

      expect(host.querySelector(".tiptap")).not.toBeNull();
      expect(consoleError.mock.calls.map((call) => call.join(" ")).join("\n")).not.toContain(
        "Cannot update a component",
      );
    } finally {
      await act(async () => {
        root?.unmount();
      });
      root = null;
      host.remove();
      ydoc.destroy();
    }
  });
});
