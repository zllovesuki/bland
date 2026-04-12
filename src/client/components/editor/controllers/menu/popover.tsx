import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  autoUpdate as autoUpdateDom,
  computePosition,
  flip as flipDom,
  offset as floatingOffsetDom,
  shift as shiftDom,
  size as sizeDom,
} from "@floating-ui/dom";
import {
  autoUpdate,
  flip,
  offset as floatingOffset,
  shift,
  size,
  useDismiss,
  useFloating,
  useInteractions,
  type Middleware,
  type Placement,
  type Strategy,
} from "@floating-ui/react";

// These hooks are intentionally split by anchor lifetime.
// - useEditorPopover is only for real DOM references.
// - useEditorRectPopover is for ephemeral caret/selection rect getters from Tiptap.
// Re-unifying them reintroduces the exact regressions from the menu refactor:
// useFloating reference churn loops in React, while late caret rects render menus at (0, 0).
interface UseEditorPopoverOptions {
  anchorRef: React.RefObject<HTMLElement | null>;
  deferOutsidePress?: boolean;
  maxHeight?: boolean;
  middleware?: Middleware[];
  offset?: number;
  onClose?: () => void;
  open: boolean;
  padding?: number;
  placement?: Placement;
  strategy?: Strategy;
}

interface UseEditorRectPopoverOptions {
  contextElement?: Element | null | (() => Element | null);
  deferOutsidePress?: boolean;
  getAnchorRect: () => DOMRect | null;
  maxHeight?: boolean;
  offset?: number;
  onClose?: () => void;
  open: boolean;
  padding?: number;
  placement?: Placement;
  strategy?: Strategy;
}

function getContextElement(contextElement: UseEditorRectPopoverOptions["contextElement"]): Element | null {
  if (typeof contextElement === "function") {
    return contextElement();
  }
  return contextElement ?? null;
}

function useDismissArmedRef(deferOutsidePress: boolean, open: boolean) {
  const dismissArmedRef = useRef(!deferOutsidePress);

  useEffect(() => {
    if (!deferOutsidePress) {
      dismissArmedRef.current = true;
      return;
    }
    if (!open) {
      dismissArmedRef.current = false;
      return;
    }

    dismissArmedRef.current = false;
    const frameId = window.requestAnimationFrame(() => {
      dismissArmedRef.current = true;
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [deferOutsidePress, open]);

  return dismissArmedRef;
}

function hiddenFloatingStyles(strategy: Strategy): CSSProperties {
  return {
    position: strategy,
    left: 0,
    top: 0,
    visibility: "hidden",
  };
}

export function useEditorPopover({
  anchorRef,
  deferOutsidePress = false,
  maxHeight = false,
  middleware = [],
  offset = 10,
  onClose,
  open,
  padding = 10,
  placement = "bottom-start",
  strategy = "fixed",
}: UseEditorPopoverOptions) {
  const dismissArmedRef = useDismissArmedRef(deferOutsidePress, open);
  const baseMiddleware = useMemo(() => {
    const next: Middleware[] = [floatingOffset(offset), shift({ padding }), flip({ padding }), ...middleware];
    if (maxHeight) {
      next.push(
        size({
          apply({ availableHeight, elements }) {
            elements.floating.style.maxHeight = `${Math.max(0, availableHeight)}px`;
          },
          padding,
        }),
      );
    }
    return next;
  }, [maxHeight, middleware, offset, padding]);

  const { context, floatingStyles, refs } = useFloating({
    open,
    onOpenChange(nextOpen) {
      if (!nextOpen) onClose?.();
    },
    placement,
    strategy,
    middleware: baseMiddleware,
    whileElementsMounted: autoUpdate,
  });

  useLayoutEffect(() => {
    refs.setReference(anchorRef.current);
  }, [anchorRef, anchorRef.current, refs]);

  const dismiss = useDismiss(context, {
    enabled: !!onClose,
    escapeKey: true,
    outsidePress: () => dismissArmedRef.current,
  });

  const { getFloatingProps } = useInteractions([dismiss]);

  return {
    floatingStyles,
    getFloatingProps,
    refs,
  };
}

export function useEditorRectPopover({
  contextElement,
  deferOutsidePress = false,
  getAnchorRect,
  maxHeight = false,
  offset = 10,
  onClose,
  open,
  padding = 10,
  placement = "bottom-start",
  strategy = "fixed",
}: UseEditorRectPopoverOptions) {
  const dismissArmedRef = useDismissArmedRef(deferOutsidePress, open);
  const [floatingElement, setFloatingElement] = useState<HTMLElement | null>(null);
  const [floatingStyles, setFloatingStyles] = useState<CSSProperties>(() => hiddenFloatingStyles(strategy));
  const getAnchorRectRef = useRef(getAnchorRect);
  const contextElementRef = useRef(contextElement);
  const lastAnchorRectRef = useRef<DOMRect | null>(null);
  const lastStylesRef = useRef(hiddenFloatingStyles(strategy));

  getAnchorRectRef.current = getAnchorRect;
  contextElementRef.current = contextElement;

  const reference = useMemo(
    () => ({
      getBoundingClientRect: () => lastAnchorRectRef.current ?? new DOMRect(),
      get contextElement() {
        return getContextElement(contextElementRef.current) ?? undefined;
      },
    }),
    [],
  );

  useEffect(() => {
    const nextHiddenStyles = hiddenFloatingStyles(strategy);
    lastStylesRef.current = nextHiddenStyles;
    setFloatingStyles(nextHiddenStyles);
    lastAnchorRectRef.current = null;
  }, [open, strategy]);

  useEffect(() => {
    if (!open || !floatingElement) return;

    let active = true;

    // Keep caret- and selection-driven popovers on computePosition. Tiptap's
    // clientRect()/coordsAtPos anchors can be null or late for a frame, and
    // forcing them through useFloating's reference lifecycle caused two regressions:
    // a React update loop in TableMenu and suggestion menus rendered at (0, 0).
    const updatePosition = async () => {
      const nextRect = getAnchorRectRef.current();
      if (nextRect) {
        lastAnchorRectRef.current = nextRect;
      }

      if (!lastAnchorRectRef.current) {
        const nextHiddenStyles = hiddenFloatingStyles(strategy);
        if (
          lastStylesRef.current.left !== nextHiddenStyles.left ||
          lastStylesRef.current.top !== nextHiddenStyles.top ||
          lastStylesRef.current.position !== nextHiddenStyles.position ||
          lastStylesRef.current.visibility !== nextHiddenStyles.visibility
        ) {
          lastStylesRef.current = nextHiddenStyles;
          setFloatingStyles(nextHiddenStyles);
        }
        return;
      }

      if (!maxHeight) {
        floatingElement.style.maxHeight = "";
      }

      const next = await computePosition(reference, floatingElement, {
        placement,
        strategy,
        middleware: [
          floatingOffsetDom(offset),
          shiftDom({ padding }),
          flipDom({ padding }),
          ...(maxHeight
            ? [
                sizeDom({
                  apply({ availableHeight, elements }) {
                    elements.floating.style.maxHeight = `${Math.max(0, availableHeight)}px`;
                  },
                  padding,
                }),
              ]
            : []),
        ],
      });

      if (!active) return;

      const nextStyles: CSSProperties = {
        position: strategy,
        left: next.x,
        top: next.y,
      };

      if (
        lastStylesRef.current.left === nextStyles.left &&
        lastStylesRef.current.top === nextStyles.top &&
        lastStylesRef.current.position === nextStyles.position &&
        lastStylesRef.current.visibility === nextStyles.visibility
      ) {
        return;
      }

      lastStylesRef.current = nextStyles;
      setFloatingStyles(nextStyles);
    };

    const cleanup = autoUpdateDom(reference, floatingElement, updatePosition, {
      animationFrame: true,
    });

    void updatePosition();

    return () => {
      active = false;
      cleanup();
    };
  }, [floatingElement, maxHeight, offset, open, padding, placement, reference, strategy]);

  useEffect(() => {
    if (!open || !onClose) return;
    const handleClose = onClose;

    function onPointerDown(event: PointerEvent) {
      if (!dismissArmedRef.current) return;
      const target = event.target as Node | null;
      if (!target) return;
      if (floatingElement?.contains(target)) return;
      handleClose();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      handleClose();
    }

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [dismissArmedRef, floatingElement, onClose, open]);

  return {
    floatingStyles,
    setFloating: setFloatingElement,
  };
}

export function preserveEditorSelectionOnMouseDown(
  event: Pick<React.MouseEvent<HTMLElement>, "preventDefault" | "target">,
  allowTarget?: (target: EventTarget | null) => boolean,
) {
  if (allowTarget?.(event.target)) return;
  if (
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement ||
    event.target instanceof HTMLSelectElement ||
    (event.target instanceof HTMLElement && event.target.isContentEditable)
  ) {
    return;
  }
  event.preventDefault();
}
