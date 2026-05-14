import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const openMenu = { kind: "row", tableKey: "table-1", index: 0 } as const;
let rowCount = 2;
const buildRowMenuSections = vi.fn();

beforeEach(() => {
  vi.resetModules();
  rowCount = 2;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  buildRowMenuSections.mockImplementation(() => [
    [
      {
        key: "row-count",
        icon: null,
        label: `Rows ${rowCount}`,
        onSelect: vi.fn(),
      },
    ],
  ]);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const editor = {
    view: {
      dispatch: vi.fn(),
      state: {
        tr: {
          setMeta: vi.fn(() => ({})),
        },
      },
    },
  };

  vi.doMock("@tiptap/react", () => ({
    useTiptap: () => ({ editor }),
    useTiptapState: () => ({
      openMenu,
      rowCount,
      colCount: 1,
      canResetWidths: false,
    }),
  }));
  vi.doMock("@floating-ui/react", () => ({
    FloatingPortal: ({ children }: { children: ReactNode }) => <>{children}</>,
    autoUpdate: vi.fn(),
    flip: vi.fn(() => ({})),
    offset: vi.fn(() => ({})),
    shift: vi.fn(() => ({})),
    useDismiss: vi.fn(() => ({})),
    useFloating: vi.fn(() => ({
      context: {},
      refs: {
        setFloating: vi.fn(),
        setReference: vi.fn(),
      },
      floatingStyles: {},
    })),
    useInteractions: vi.fn(() => ({
      getFloatingProps: (props: Record<string, unknown>) => props,
    })),
  }));
  vi.doMock("@/client/components/editor/controllers/table-menu-actions", () => ({
    buildColumnMenuSections: vi.fn(() => []),
    buildRowMenuSections,
    buildTableMenuSections: vi.fn(() => []),
  }));
  vi.doMock("@/client/components/editor/extensions/table/state", () => ({
    resolveOpenMenuState: vi.fn(),
    tableHandleSelector: vi.fn(() => "[data-table-trigger]"),
    tableHandlesKey: {
      getState: vi.fn(() => ({ openMenu })),
    },
  }));
  vi.doMock("@/client/components/editor/extensions/table/widths", () => ({
    hasExplicitColumnWidths: vi.fn(() => false),
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("TableMenu", () => {
  it("refreshes section availability when row or column counts change under the same open menu", async () => {
    const trigger = document.createElement("button");
    trigger.setAttribute("data-table-trigger", "");
    document.body.appendChild(trigger);

    const { TableMenu } = await import("@/client/components/editor/controllers/table-menu");

    const host = document.createElement("div");
    document.body.appendChild(host);
    let root: Root | null = createRoot(host);

    try {
      await act(async () => {
        root!.render(<TableMenu />);
      });

      expect(host.textContent).toContain("Rows 2");
      const callsAfterInitialOpen = buildRowMenuSections.mock.calls.length;

      rowCount = 3;

      await act(async () => {
        root!.render(<TableMenu />);
      });

      expect(host.textContent).toContain("Rows 3");
      expect(buildRowMenuSections.mock.calls.length).toBeGreaterThan(callsAfterInitialOpen);
    } finally {
      await act(async () => {
        root?.unmount();
      });
      root = null;
      host.remove();
      trigger.remove();
    }
  });
});
