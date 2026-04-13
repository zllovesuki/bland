import { useEffect, useLayoutEffect, useRef } from "react";
import { autoUpdate, flip, offset, shift, useFloating } from "@floating-ui/react";
import { createPortal } from "react-dom";

type Align = "left" | "right";

interface DropdownPortalProps {
  triggerRef: React.RefObject<HTMLElement | null>;
  align?: Align;
  width?: number;
  zIndex?: number;
  className?: string;
  children: React.ReactNode;
  onClose?: () => void;
}

export function DropdownPortal({
  triggerRef,
  align = "right",
  width = 128,
  zIndex = 50,
  className,
  children,
  onClose,
}: DropdownPortalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const referenceEl = triggerRef.current;
  const placement = align === "right" ? "bottom-end" : "bottom-start";
  const { refs, floatingStyles } = useFloating({
    open: true,
    placement,
    strategy: "fixed",
    middleware: [offset(4), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  useLayoutEffect(() => {
    if (!referenceEl) return;
    refs.setReference(referenceEl);
  }, [referenceEl, refs]);

  useEffect(() => {
    if (!onClose) return;
    const handleClose = onClose;

    function handleClick(e: PointerEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      handleClose();
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }

    document.addEventListener("pointerdown", handleClick, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handleClick, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, triggerRef]);

  return createPortal(
    <div
      ref={(node) => {
        refs.setFloating(node);
        panelRef.current = node;
      }}
      className={`animate-fade-in ${align === "right" ? "origin-top-right" : "origin-top-left"} rounded-md border border-zinc-700 bg-zinc-800 shadow-lg ${className ?? ""}`}
      style={{ ...floatingStyles, width, zIndex }}
    >
      {children}
    </div>,
    document.body,
  );
}
