import { StrictMode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const resolveMock = vi.fn();

beforeEach(() => {
  vi.resetModules();
  resolveMock.mockReset();
  vi.doMock("@/client/lib/api", () => ({
    api: {
      pageMentions: {
        resolve: resolveMock,
      },
    },
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function flushReactWork() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("PageMentionProvider", () => {
  it("keeps a live resolver under React StrictMode", async () => {
    resolveMock.mockResolvedValue({
      mentions: [{ page_id: "page-2", accessible: true, title: "Roadmap", icon: null }],
    });

    const { PageMentionProvider } = await import("@/client/components/page-mention/provider");
    const { usePageMentionEntry } = await import("@/client/components/page-mention/context");

    function Probe() {
      const entry = usePageMentionEntry("page-2");
      return <span>{entry.title ?? entry.status}</span>;
    }

    const host = document.createElement("div");
    document.body.appendChild(host);
    let root: Root | null = createRoot(host);

    try {
      await act(async () => {
        root!.render(
          <StrictMode>
            <PageMentionProvider
              workspaceId="workspace-1"
              scopeKey="canonical:workspace-1:member"
              cacheMode="live"
              networkEnabled={true}
              navigate={() => {}}
            >
              <Probe />
            </PageMentionProvider>
          </StrictMode>,
        );
      });
      await flushReactWork();

      expect(resolveMock).toHaveBeenCalledWith("workspace-1", ["page-2"], undefined);
      expect(host.textContent).toBe("Roadmap");
    } finally {
      await act(async () => {
        root?.unmount();
      });
      root = null;
      host.remove();
    }
  });
});
