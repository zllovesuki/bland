import { useEffect } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("DocumentPage", () => {
  it("does not retain schema errors across keyed page identity changes", async () => {
    let pageAErrored = false;

    vi.doMock("@/client/hooks/use-media-query", () => ({
      useMediaQuery: () => false,
    }));
    vi.doMock("@/client/lib/report-client-error", () => ({
      reportClientError: vi.fn(),
    }));
    vi.doMock("@/client/components/toast-store", () => ({
      toast: {
        error: vi.fn(),
      },
    }));
    vi.doMock("@/client/components/editor/use-editor-session", () => ({
      useEditorSession: (opts: { initialTitle: string }) => ({
        kind: "ready",
        title: opts.initialTitle,
        onTitleInput: vi.fn(),
        fragment: {},
        provider: {},
      }),
    }));
    vi.doMock("@/client/components/editor/editor-body", () => ({
      EditorBody: ({ pageId, onSchemaError }: { pageId: string; onSchemaError?: (error: Error) => void }) => {
        useEffect(() => {
          if (pageId !== "page-a" || pageAErrored) return;
          pageAErrored = true;
          onSchemaError?.(new Error("bad schema"));
        }, [onSchemaError, pageId]);
        return <div>{`Editor ${pageId}`}</div>;
      },
    }));

    const { DocumentPage } = await import("@/client/components/editor/document-page");

    function Harness({ pageId }: { pageId: string }) {
      return (
        <DocumentPage
          key={pageId}
          pageId={pageId}
          initialTitle={pageId}
          workspaceId="workspace-1"
          affordance={affordance}
          outlineMode="inline"
          chrome={<div>Chrome</div>}
        />
      );
    }

    const host = document.createElement("div");
    document.body.appendChild(host);
    let root: Root | null = createRoot(host);

    try {
      await act(async () => {
        root!.render(<Harness pageId="page-a" />);
      });

      expect(host.textContent).toContain("This build can't parse this page. Reload to catch up.");

      await act(async () => {
        root!.render(<Harness pageId="page-b" />);
      });

      expect(host.textContent).toContain("Editor page-b");

      await act(async () => {
        root!.render(<Harness pageId="page-a" />);
      });

      expect(host.textContent).toContain("Editor page-a");
    } finally {
      await act(async () => {
        root?.unmount();
      });
      root = null;
      host.remove();
    }
  });
});
