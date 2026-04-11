import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useFloating, offset, shift, autoUpdate } from "@floating-ui/react";
import { type ColorEntry } from "./colors";
import "../styles/color-picker.css";

interface ColorPickerPanelProps {
  colors: ColorEntry[];
  activeColor: string | null;
  nullFallback: string;
  onSelect: (color: string | null) => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}

export function ColorPickerPanel({
  colors,
  activeColor,
  nullFallback,
  onSelect,
  triggerRef,
  onClose,
}: ColorPickerPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  const { floatingStyles, refs } = useFloating({
    open: true,
    placement: "bottom-start",
    middleware: [offset(6), shift({ padding: 10 })],
    elements: { reference: triggerRef.current },
    whileElementsMounted: autoUpdate,
  });

  useEffect(() => {
    function handler(e: MouseEvent) {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      onClose();
    }
    document.addEventListener("mousedown", handler, true);
    return () => document.removeEventListener("mousedown", handler, true);
  }, [onClose, triggerRef]);

  return createPortal(
    <div
      ref={(node) => {
        refs.setFloating(node);
        panelRef.current = node;
      }}
      className="tiptap-color-panel"
      style={floatingStyles}
    >
      {colors.map((c) => (
        <button
          key={c.label}
          type="button"
          title={c.label}
          className={`tiptap-color-swatch${(activeColor ?? null) === c.value ? " is-active" : ""}`}
          style={{
            backgroundColor: c.value ?? nullFallback,
            ...(c.value === null ? { backgroundImage: "linear-gradient(135deg, #71717a 25%, transparent 25%)" } : {}),
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(c.value);
          }}
        />
      ))}
    </div>,
    document.body,
  );
}
