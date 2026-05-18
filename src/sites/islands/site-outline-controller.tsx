import { useEffect } from "react";
import { OutlinePresentation } from "@/shared/editor/components/outline";
import { resolveViewportActiveOutlineHeading } from "@/shared/editor/components/outline-model";
import type { SiteOutlineControllerProps } from "@/sites/shared/island-schemas";

const OUTLINE_LINK_SELECTOR = ".tiptap-outline__link[data-outline-id]";

export function SiteOutlineController({ items }: SiteOutlineControllerProps) {
  useEffect(() => {
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>(OUTLINE_LINK_SELECTOR));
    if (links.length === 0) return;

    const headings = Array.from(new Set(links.map((link) => link.dataset.outlineId).filter(Boolean)))
      .map((id) => {
        const element = document.getElementById(id!);
        return element instanceof HTMLElement ? { id: id!, element } : null;
      })
      .filter((entry): entry is { id: string; element: HTMLElement } => entry !== null);

    if (headings.length === 0) return;

    let rafId: number | null = null;

    const setActive = (activeId: string | null) => {
      for (const link of links) {
        const active = activeId !== null && link.dataset.outlineId === activeId;
        link.dataset.active = active ? "true" : "false";
        if (active) {
          link.setAttribute("aria-current", "location");
        } else {
          link.removeAttribute("aria-current");
        }
      }
    };

    const recompute = () => {
      rafId = null;
      setActive(
        resolveViewportActiveOutlineHeading(
          headings.map((heading) => {
            const rect = heading.element.getBoundingClientRect();
            return {
              id: heading.id,
              top: rect.top,
              bottom: rect.bottom,
              hidden: heading.element.offsetParent === null,
            };
          }),
          { top: 0, height: window.innerHeight },
        ),
      );
    };

    const schedule = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(recompute);
    };

    recompute();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("hashchange", schedule, { passive: true });

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("hashchange", schedule);
    };
  }, []);

  return <OutlinePresentation items={items} mode="link" variant="rail" />;
}
