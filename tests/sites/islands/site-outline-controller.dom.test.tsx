import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SiteOutlineController } from "@/sites/islands/site-outline-controller";

let host: HTMLElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    return window.setTimeout(() => cb(performance.now()), 0) as unknown as number;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    window.clearTimeout(id);
  });

  document.body.innerHTML = `
    <h2 id="intro">Intro</h2>
    <h2 id="second">Second</h2>
    <nav class="tiptap-outline">
      <a class="tiptap-outline__button tiptap-outline__link" data-outline-id="intro" data-active="false" href="#intro">Intro</a>
      <a class="tiptap-outline__button tiptap-outline__link" data-outline-id="second" data-active="false" href="#second">Second</a>
    </nav>
    <div id="rail-host"></div>
  `;

  const intro = document.getElementById("intro")!;
  const second = document.getElementById("second")!;
  Object.defineProperty(intro, "offsetParent", { configurable: true, get: () => document.body });
  Object.defineProperty(second, "offsetParent", { configurable: true, get: () => document.body });
  intro.getBoundingClientRect = () => ({ top: 40, bottom: 80 }) as DOMRect;
  second.getBoundingClientRect = () => ({ top: 520, bottom: 560 }) as DOMRect;

  host = document.getElementById("rail-host")!;
  root = createRoot(host);
  act(() => {
    root.render(
      <SiteOutlineController
        items={[
          { id: "intro", text: "Intro", level: 1, href: "#intro" },
          { id: "second", text: "Second", level: 1, href: "#second" },
        ]}
      />,
    );
  });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("SiteOutlineController", () => {
  it("updates every duplicate outline link on simulated viewport changes", () => {
    expect(document.querySelectorAll("[data-outline-id='intro'][data-active='true']").length).toBeGreaterThanOrEqual(2);
    expect(
      document.querySelectorAll("[data-outline-id='intro'][aria-current='location']").length,
    ).toBeGreaterThanOrEqual(2);

    const intro = document.getElementById("intro")!;
    const second = document.getElementById("second")!;
    intro.getBoundingClientRect = () => ({ top: -140, bottom: -80 }) as DOMRect;
    second.getBoundingClientRect = () => ({ top: 180, bottom: 220 }) as DOMRect;

    act(() => {
      window.dispatchEvent(new Event("scroll"));
      vi.runOnlyPendingTimers();
    });

    expect(document.querySelectorAll("[data-outline-id='second'][data-active='true']").length).toBeGreaterThanOrEqual(
      2,
    );
    expect(document.querySelectorAll("[data-outline-id='intro'][aria-current='location']")).toHaveLength(0);
  });
});
