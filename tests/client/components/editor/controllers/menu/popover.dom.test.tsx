import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let latestPositionUpdate: (() => void | Promise<void>) | null = null;

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  latestPositionUpdate = null;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

async function flushFloatingPosition() {
  await act(async () => {
    await latestPositionUpdate?.();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("useEditorRectPopover", () => {
  it("hides while closed or unresolved instead of reusing stale coordinates", async () => {
    vi.doMock("@floating-ui/dom", () => ({
      autoUpdate: vi.fn((_reference: Element, _floating: HTMLElement, update: () => void | Promise<void>) => {
        latestPositionUpdate = update;
        void update();
        return () => {
          if (latestPositionUpdate === update) {
            latestPositionUpdate = null;
          }
        };
      }),
      computePosition: vi.fn(async (reference: { getBoundingClientRect: () => DOMRect }) => {
        const rect = reference.getBoundingClientRect();
        return { x: rect.left + 10, y: rect.top + 20 };
      }),
      flip: vi.fn(() => ({})),
      offset: vi.fn(() => ({})),
      shift: vi.fn(() => ({})),
      size: vi.fn(() => ({})),
    }));

    const { useEditorRectPopover } = await import("@/client/components/editor/controllers/menu/popover");

    function Probe({ open, rect }: { open: boolean; rect: DOMRect | null }) {
      const { floatingStyles, setFloating } = useEditorRectPopover({
        open,
        getAnchorRect: () => rect,
        contextElement: () => document.body,
      });
      return <div data-testid="floating" ref={setFloating} style={floatingStyles} />;
    }

    const host = document.createElement("div");
    document.body.appendChild(host);
    let root: Root | null = createRoot(host);

    const floating = () => host.querySelector<HTMLElement>('[data-testid="floating"]');
    const render = async (open: boolean, rect: DOMRect | null) => {
      await act(async () => {
        root!.render(<Probe open={open} rect={rect} />);
      });
      await flushFloatingPosition();
    };

    try {
      await render(true, new DOMRect(100, 200, 10, 10));
      expect(floating()?.style.left).toBe("110px");
      expect(floating()?.style.top).toBe("220px");
      expect(floating()?.style.visibility).toBe("");

      await render(false, new DOMRect(100, 200, 10, 10));
      expect(floating()?.style.left).toBe("0px");
      expect(floating()?.style.top).toBe("0px");
      expect(floating()?.style.visibility).toBe("hidden");

      await render(true, null);
      expect(floating()?.style.left).toBe("0px");
      expect(floating()?.style.top).toBe("0px");
      expect(floating()?.style.visibility).toBe("hidden");

      await render(true, new DOMRect(5, 6, 1, 1));
      expect(floating()?.style.left).toBe("15px");
      expect(floating()?.style.top).toBe("26px");
      expect(floating()?.style.visibility).toBe("");
    } finally {
      await act(async () => {
        root?.unmount();
      });
      root = null;
      host.remove();
    }
  });
});
