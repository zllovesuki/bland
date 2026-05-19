import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { autoUpdate, flip, offset, shift, size, useFloating } from "@floating-ui/react";
import { createPortal } from "react-dom";

type Align = "left" | "right";
type WidthMode = "fixed" | "match-trigger";

interface DropdownPortalProps {
  triggerRef: RefObject<HTMLElement | null>;
  align?: Align;
  width?: number;
  widthMode?: WidthMode;
  zIndex?: number;
  className?: string;
  children: ReactNode;
  onClose?: () => void;
}

export function DropdownPortal({
  triggerRef,
  align = "right",
  width = 128,
  widthMode = "fixed",
  zIndex = 50,
  className,
  children,
  onClose,
}: DropdownPortalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const placement = align === "right" ? "bottom-end" : "bottom-start";
  const matchTrigger = widthMode === "match-trigger";
  const { refs, floatingStyles } = useFloating({
    open: true,
    placement,
    strategy: "fixed",
    middleware: matchTrigger
      ? [
          offset(4),
          flip({ padding: 8 }),
          shift({ padding: 8 }),
          size({
            apply({ rects, elements }) {
              elements.floating.style.width = `${rects.reference.width}px`;
            },
          }),
        ]
      : [offset(4), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });
  const panelAnimationStyle: CSSProperties = {
    animation: "var(--animate-menu)",
    transformOrigin: align === "right" ? "top right" : "top left",
  };

  useLayoutEffect(() => {
    const referenceEl = triggerRef.current;
    if (!referenceEl) return;
    refs.setReference(referenceEl);
  }, [refs, triggerRef]);

  // Effect Event so callers can pass inline `onClose={() => setOpen(false)}` without
  // re-binding document listeners on every parent render.
  const handleClose = useEffectEvent(() => onClose?.());

  useEffect(() => {
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
  }, [triggerRef]);

  return createPortal(
    <div
      ref={(node) => {
        refs.setFloating(node);
        panelRef.current = node;
      }}
      style={{ ...floatingStyles, ...(matchTrigger ? {} : { width }), zIndex }}
    >
      <div
        className={`w-full rounded-md border border-zinc-700 bg-zinc-800 shadow-lg ${className ?? ""}`}
        style={panelAnimationStyle}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
