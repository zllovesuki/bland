import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SitesImage } from "@/client/sites/islands/sites-image";
import type { SitesImageProps } from "@/shared/sites/island-schemas";

let container: HTMLElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.unstubAllGlobals();
});

function mount(props: SitesImageProps) {
  act(() => {
    root.render(<SitesImage {...props} />);
  });
}

describe("SitesImage", () => {
  it("starts with is-loading and clears it on img.load", () => {
    mount({ src: "/_assets/1/x", align: "left", naturalWidth: 1200, naturalHeight: 800 });
    const container = document.querySelector(".tiptap-image-container") as HTMLElement;
    expect(container.classList.contains("is-loading")).toBe(true);
    const skeleton = container.querySelector(".tiptap-image-load-skeleton");
    expect(skeleton).not.toBeNull();
    expect(skeleton?.className).toContain("bg-gradient-to-r");
    expect(skeleton?.className).toContain("animate-shimmer");
    expect(skeleton?.getAttribute("aria-hidden")).toBe("true");

    const img = container.querySelector("img") as HTMLImageElement;
    act(() => {
      img.dispatchEvent(new Event("load"));
    });

    expect(document.querySelector(".tiptap-image-container.is-loading")).toBeNull();
  });

  it("derives aspect-ratio from natural dimensions", () => {
    mount({ src: "/_assets/1/x", align: "left", naturalWidth: 1280, naturalHeight: 720 });
    const container = document.querySelector(".tiptap-image-container") as HTMLElement;
    expect(container.style.aspectRatio).toContain(String(1280 / 720));
  });

  it("renders the error state when the img errors", () => {
    mount({ src: "/broken", align: "left" });
    const img = document.querySelector("img") as HTMLImageElement;
    act(() => {
      img.dispatchEvent(new Event("error"));
    });
    expect(document.querySelector(".tiptap-image-error")).not.toBeNull();
    expect(document.querySelector(".tiptap-image-container.is-loading")).toBeNull();
  });

  it("keeps brightness through image loading and resets it without filtering the caption", () => {
    const props = { src: "/_assets/1/x", align: "left" as const, alt: "Screenshot", brightness: 75 };
    mount(props);
    const img = container.querySelector("img")!;
    expect(img.style.filter).toBe("brightness(0.75)");
    act(() => img.dispatchEvent(new Event("load")));
    expect(img.style.filter).toBe("brightness(0.75)");
    expect(container.querySelector("figcaption")?.textContent).toBe("Screenshot");
    expect(container.querySelector("figure")?.style.filter).toBe("");
    mount({ ...props, brightness: 100 });
    expect(img.style.filter).toBe("");
    expect(img.getAttribute("src")).toBe(props.src);
  });
});
