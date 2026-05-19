import { useEffect, useEffectEvent, useMemo, useState } from "react";
import type { Editor } from "@tiptap/react";
import { resolveViewportActiveOutlineHeading } from "@/shared/editor/model/outline";
import type { HeadingOutlineItem } from "./heading-outline";

function findScrollContainer(el: HTMLElement | null): HTMLElement | null {
  let cur: HTMLElement | null = el;
  while (cur && cur !== document.body) {
    const style = getComputedStyle(cur);
    if (style.overflowY === "auto" || style.overflowY === "scroll") return cur;
    cur = cur.parentElement;
  }
  return null;
}

export function useViewportActiveHeading(
  editor: Editor | null | undefined,
  headings: HeadingOutlineItem[],
): number | null {
  const [activePos, setActivePos] = useState<number | null>(null);
  const readHeadings = useEffectEvent(() => headings);

  const positionsKey = useMemo(() => headings.map((h) => `${h.pos}:${h.level}`).join(","), [headings]);

  useEffect(() => {
    if (!editor) return;
    if (readHeadings().length === 0) {
      return;
    }
    const scrollEl = findScrollContainer(editor.view.dom.parentElement);
    if (!scrollEl) return;

    let rafId: number | null = null;

    const recompute = () => {
      rafId = null;
      const current = readHeadings();
      if (current.length === 0) {
        setActivePos((prev) => (prev === null ? prev : null));
        return;
      }
      const containerRect = scrollEl.getBoundingClientRect();
      const containerTop = containerRect.top;
      const next = resolveViewportActiveOutlineHeading(
        current
          .map((heading) => {
            const node = editor.view.nodeDOM(heading.pos);
            if (!(node instanceof HTMLElement)) return null;
            const rect = node.getBoundingClientRect();
            return {
              id: heading.pos,
              top: rect.top,
              bottom: rect.bottom,
              // Skip collapsed/hidden headings (e.g. inside a closed details block).
              hidden: node.offsetParent === null,
            };
          })
          .filter(
            (heading): heading is { id: number; top: number; bottom: number; hidden: boolean } => heading !== null,
          ),
        { top: containerTop, height: scrollEl.clientHeight },
      );
      setActivePos((prev) => (prev === next ? prev : next));
    };

    const schedule = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(recompute);
    };

    recompute();

    scrollEl.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });

    // Observe the scroll container's content wrapper so we recompute when
    // anything above the editor reflows (title edits, cover toggles, image
    // loads elsewhere on the page).
    const ro = new ResizeObserver(schedule);
    const contentRoot = scrollEl.firstElementChild;
    if (contentRoot instanceof HTMLElement) {
      ro.observe(contentRoot);
    } else {
      ro.observe(editor.view.dom);
    }

    return () => {
      scrollEl.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      ro.disconnect();
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, [editor, positionsKey]);

  return headings.length === 0 ? null : activePos;
}
