import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";

type Align = "left" | "right";

interface DropdownPortalProps {
  triggerRef: React.RefObject<HTMLElement | null>;
  align?: Align;
  width?: number;
  className?: string;
  children: React.ReactNode;
}

export function DropdownPortal({ triggerRef, align = "right", width = 128, className, children }: DropdownPortalProps) {
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useLayoutEffect(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({
      top: rect.bottom + 4,
      left: align === "right" ? rect.right - width : rect.left,
    });
  }, [triggerRef, align, width]);

  return createPortal(
    <div
      className={`animate-scale-fade fixed z-50 origin-top-right rounded-md border border-zinc-700 bg-zinc-800 shadow-lg ${className ?? ""}`}
      style={{ top: pos.top, left: pos.left, width }}
    >
      {children}
    </div>,
    document.body,
  );
}
