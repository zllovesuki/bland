import { useEffect, useRef } from "react";
import { offset, shift, size, type Placement } from "@floating-ui/react";

export function freezePlacementOnOpen(
  open: boolean,
  nextPlacement: Placement,
  setPlacement: (placement: Placement) => void,
) {
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setPlacement(nextPlacement);
    }
    wasOpenRef.current = open;
  }, [open, nextPlacement, setPlacement]);
}

export function choosePlacement(rect: DOMRect | undefined, preferred: Placement, minSpace: number): Placement {
  if (!rect || typeof window === "undefined") return preferred;

  const topSpace = rect.top;
  const bottomSpace = window.innerHeight - rect.bottom;

  if (preferred.startsWith("top")) {
    return topSpace < minSpace && bottomSpace > topSpace
      ? (preferred.replace("top", "bottom") as Placement)
      : preferred;
  }

  if (preferred.startsWith("bottom")) {
    return bottomSpace < minSpace && topSpace > bottomSpace
      ? (preferred.replace("bottom", "top") as Placement)
      : preferred;
  }

  return preferred;
}

export const MENU_MIDDLEWARE = [
  offset(10),
  shift({ padding: 10 }),
  size({
    apply({ elements, availableHeight }) {
      elements.floating.style.maxHeight = `${Math.max(0, availableHeight)}px`;
    },
    padding: 10,
  }),
] as const;

export const POPOVER_MIDDLEWARE = [offset(10), shift({ padding: 10 })] as const;
