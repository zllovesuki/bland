import { useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import type { HeadingOutlineItem } from "./heading-outline";

const ACTIVATION_ZONE_FRACTION = 0.4;
const ACTIVATION_ZONE_MAX_PX = 480;
// Minimum heading visibility required before a below-activation heading can
// claim active. Prevents twitchy flips when a heading is peeking by a pixel.
const MIN_VISIBLE_BELOW_PX = 16;

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
  const headingsRef = useRef(headings);
  headingsRef.current = headings;

  const positionsKey = useMemo(() => headings.map((h) => `${h.pos}:${h.level}`).join(","), [headings]);

  useEffect(() => {
    if (!editor) return;
    if (headingsRef.current.length === 0) {
      setActivePos((prev) => (prev === null ? prev : null));
      return;
    }
    const scrollEl = findScrollContainer(editor.view.dom.parentElement);
    if (!scrollEl) return;

    let rafId: number | null = null;

    const recompute = () => {
      rafId = null;
      const current = headingsRef.current;
      if (current.length === 0) {
        setActivePos((prev) => (prev === null ? prev : null));
        return;
      }
      const containerRect = scrollEl.getBoundingClientRect();
      const containerTop = containerRect.top;
      const containerBottom = containerTop + scrollEl.clientHeight;
      const activationBottom =
        containerTop + Math.min(scrollEl.clientHeight * ACTIVATION_ZONE_FRACTION, ACTIVATION_ZONE_MAX_PX);
      const visibleBelowCutoff = containerBottom - MIN_VISIBLE_BELOW_PX;

      // Priority chain:
      // 1. A heading still crossing the top edge (we're reading just below it).
      // 2. First heading inside the activation zone (top 40%, ≤480px).
      // 3. First heading sufficiently visible below the activation zone — handles
      //    the case where we've fully scrolled past the previous section and the
      //    next heading is the only anchor on screen.
      // 4. Last heading that scrolled past the top (long-section fallback).
      let intersectingTop: number | null = null;
      let firstInActivation: number | null = null;
      let firstVisibleBelow: number | null = null;
      let lastAboveTop: number | null = null;

      for (const heading of current) {
        const node = editor.view.nodeDOM(heading.pos);
        if (!(node instanceof HTMLElement)) continue;
        // Skip collapsed/hidden headings (e.g. inside a closed details block).
        if (node.offsetParent === null) continue;
        const rect = node.getBoundingClientRect();
        if (rect.bottom <= containerTop) {
          lastAboveTop = heading.pos;
        } else if (rect.top < containerTop) {
          intersectingTop = heading.pos;
          lastAboveTop = heading.pos;
        } else if (rect.top <= activationBottom) {
          if (firstInActivation === null) firstInActivation = heading.pos;
        } else if (rect.top <= visibleBelowCutoff) {
          firstVisibleBelow = heading.pos;
          break;
        } else {
          break;
        }
      }

      const next = intersectingTop ?? firstInActivation ?? firstVisibleBelow ?? lastAboveTop;
      setActivePos((prev) => (prev === next ? prev : next));
    };

    const schedule = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(recompute);
    };

    recompute();

    scrollEl.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);

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

  return activePos;
}
