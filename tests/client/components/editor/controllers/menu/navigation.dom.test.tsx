import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMenuNavigation } from "@/client/components/editor/controllers/menu/navigation";

interface NavigationHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
}

beforeEach(() => {
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useMenuNavigation", () => {
  it("resets selection for a new filtered item set before Enter selects", async () => {
    let navigation: NavigationHandle | null = null;
    const onSelect = vi.fn();

    function Probe({ items }: { items: string[] }) {
      navigation = useMenuNavigation({
        items,
        listRef: { current: null },
        onSelect,
      });
      return <output>{navigation.selectedIndex}</output>;
    }

    const host = document.createElement("div");
    document.body.appendChild(host);
    let root: Root | null = createRoot(host);

    try {
      const initialItems = ["Alpha", "Beta", "Gamma"];
      await act(async () => {
        root!.render(<Probe items={initialItems} />);
      });

      act(() => {
        navigation!.setSelectedIndex(2);
      });
      expect(host.textContent).toBe("2");

      const filteredItems = ["Beta"];
      await act(async () => {
        root!.render(<Probe items={filteredItems} />);
      });

      expect(host.textContent).toBe("0");

      act(() => {
        navigation!.onKeyDown(new KeyboardEvent("keydown", { key: "Enter" }));
      });

      expect(onSelect).toHaveBeenCalledWith("Beta");
    } finally {
      await act(async () => {
        root?.unmount();
      });
      root = null;
      host.remove();
    }
  });
});
