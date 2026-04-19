import { useEffect, useState, useRef } from "react";

/**
 * Tracks whether a header/element should be visible based on scroll direction
 * within a given scroll container (not the window).
 */
export function useScrollVisibility(scrollElementId: string, threshold = 5, minOverflow = 80): boolean {
  const [visible, setVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const el = document.getElementById(scrollElementId);
    if (!el) return;

    function onScroll() {
      const currentY = el!.scrollTop;
      if (currentY < 10) {
        setVisible(true);
      } else if (currentY > lastScrollY.current + threshold) {
        // Hiding grows the scroll container by the header height; if overflow
        // is shallow, that collapses the scroll and loops visible/hidden.
        if (el!.scrollHeight - el!.clientHeight > minOverflow) {
          setVisible(false);
        }
      }
      lastScrollY.current = currentY;
    }

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollElementId, threshold, minOverflow]);

  return visible;
}
