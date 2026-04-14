import { FloatingPortal } from "@floating-ui/react";
import { preserveEditorSelectionOnMouseDown, useEditorRectPopover } from "./menu/popover";
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
  const { floatingStyles, setFloating } = useEditorRectPopover({
    open: true,
    onClose,
    contextElement: () => triggerRef.current,
    getAnchorRect: () => triggerRef.current?.getBoundingClientRect() ?? null,
    offset: 6,
  });

  return (
    <FloatingPortal>
      <div
        ref={setFloating}
        className="tiptap-menu-surface tiptap-color-panel"
        style={{ ...floatingStyles, zIndex: 60 }}
        onMouseDownCapture={(e) => preserveEditorSelectionOnMouseDown(e)}
      >
        {colors.map((c) => (
          <button
            key={c.label}
            type="button"
            title={c.label}
            aria-label={c.label}
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
      </div>
    </FloatingPortal>
  );
}
