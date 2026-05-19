import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CopyCodeButton } from "@/client/sites/islands/copy-code-button";

let host: HTMLElement;
let root: Root;
const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  writeText.mockReset();
  writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });

  document.body.innerHTML = `
    <div class="tiptap-code-block-wrapper">
      <pre><code class="tiptap-code-block-content">const answer = 42;</code></pre>
      <div id="island-host"></div>
    </div>
  `;
  host = document.getElementById("island-host") as HTMLElement;
  root = createRoot(host);
  act(() => {
    root.render(<CopyCodeButton />);
  });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  document.body.innerHTML = "";
  Reflect.deleteProperty(navigator, "clipboard");
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("CopyCodeButton", () => {
  it("copies the nearest code text and toggles feedback for 2s", async () => {
    const button = host.querySelector<HTMLButtonElement>(".tiptap-code-block-copy-btn")!;
    act(() => {
      button.click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith("const answer = 42;");
    expect(button.dataset.copied).toBe("true");
    expect(button.getAttribute("aria-label")).toBe("Code copied");

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(button.dataset.copied).toBeUndefined();
    expect(button.getAttribute("aria-label")).toBe("Copy code");
  });

  it("does not throw when clipboard.writeText rejects", async () => {
    writeText.mockRejectedValueOnce(new Error("denied"));
    const button = host.querySelector<HTMLButtonElement>(".tiptap-code-block-copy-btn")!;
    act(() => {
      button.click();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(button.dataset.copied).toBeUndefined();
  });
});
