import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ToolbarButton } from "@/client/components/editor/controllers/toolbar-button";

it("activates once for pointer clicks and also supports keyboard clicks", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const activate = vi.fn();
  try {
    act(() =>
      root.render(
        <ToolbarButton title="Reset brightness" onActivate={activate}>
          Reset
        </ToolbarButton>,
      ),
    );
    const button = container.querySelector("button")!;
    act(() => {
      button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, detail: 1 }));
      button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));
    });
    expect(activate).toHaveBeenCalledTimes(1);
    act(() => button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 })));
    expect(activate).toHaveBeenCalledTimes(2);
  } finally {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
