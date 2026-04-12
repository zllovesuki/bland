import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFloating, autoUpdate, flip, offset, shift, type VirtualElement } from "@floating-ui/react";
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import {
  buildColumnMenuSections,
  buildRowMenuSections,
  buildTableMenuSections,
  type TableMenuAction,
  type TableMenuSection,
} from "./table-menu-actions";
import {
  activeCellInfo,
  resolveOpenMenuState,
  tableHandleSelector,
  tableHandlesKey,
  type OpenMenuState,
} from "../extensions/table/state";
import { hasExplicitColumnWidths } from "../extensions/table/widths";

interface TableMenuProps {
  editor: Editor;
}

interface MenuDerivedState {
  openMenu: OpenMenuState | null;
  rowCount: number;
  colCount: number;
  canMerge: boolean;
  canSplit: boolean;
  canResetWidths: boolean;
}

export function TableMenu({ editor }: TableMenuProps) {
  const state = useEditorState<MenuDerivedState>({
    editor,
    selector: (ctx) => {
      const e = ctx.editor;
      const pluginState = tableHandlesKey.getState(e.state);
      const openMenu = pluginState?.openMenu ?? null;
      let rowCount = 0;
      let colCount = 0;
      let canResetWidths = false;
      const resolved = openMenu ? resolveOpenMenuState(e.state.doc, openMenu) : null;
      if (resolved) {
        rowCount = resolved.rowCount;
        colCount = resolved.colCount;
        canResetWidths = hasExplicitColumnWidths(resolved.table);
      }
      const active = activeCellInfo(e.state);
      const selectionInOpenTable = !!resolved && active?.tablePos === resolved.tablePos;
      return {
        openMenu,
        rowCount,
        colCount,
        canMerge: selectionInOpenTable && e.can().mergeCells(),
        canSplit: selectionInOpenTable && e.can().splitCell(),
        canResetWidths,
      };
    },
  });

  const { openMenu } = state;
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [hasTrigger, setHasTrigger] = useState(false);
  const selector = useMemo(() => tableHandleSelector(openMenu), [openMenu]);

  const resolveTriggerEl = useCallback(() => {
    if (!selector) return null;
    return document.querySelector<HTMLElement>(selector);
  }, [selector]);

  const close = useCallback(() => {
    editor.view.dispatch(editor.view.state.tr.setMeta(tableHandlesKey, { openMenu: "close" }));
    resolveTriggerEl()?.focus();
  }, [editor, resolveTriggerEl]);

  useEffect(() => {
    if (!selector) {
      setHasTrigger(false);
      return;
    }
    let raf = 0;
    const find = () => {
      if (resolveTriggerEl()) {
        setHasTrigger(true);
      } else {
        raf = requestAnimationFrame(find);
      }
    };
    find();
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [resolveTriggerEl, selector]);

  const sections = useMemo<TableMenuSection[]>(() => {
    if (!openMenu) return [];
    if (openMenu.kind === "row") {
      return buildRowMenuSections({ editor, openMenu, onDone: close });
    }
    if (openMenu.kind === "col") {
      return buildColumnMenuSections({ editor, openMenu, onDone: close });
    }
    return buildTableMenuSections({
      editor,
      openMenu,
      canMerge: state.canMerge,
      canSplit: state.canSplit,
      canResetWidths: state.canResetWidths,
      onDone: close,
    });
  }, [close, editor, openMenu, state.canMerge, state.canResetWidths, state.canSplit, state.colCount, state.rowCount]);

  const virtualReference = useMemo<VirtualElement | null>(() => {
    if (!selector) return null;
    return {
      getBoundingClientRect: () => resolveTriggerEl()?.getBoundingClientRect() ?? new DOMRect(),
      get contextElement() {
        return resolveTriggerEl() ?? undefined;
      },
    } as VirtualElement;
  }, [resolveTriggerEl, selector]);

  const { refs, floatingStyles } = useFloating({
    open: !!openMenu,
    placement: openMenu?.kind === "row" ? "right-start" : openMenu?.kind === "col" ? "bottom-start" : "bottom-end",
    strategy: "fixed",
    middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  useLayoutEffect(() => {
    refs.setReference(virtualReference);
  }, [refs, virtualReference]);

  useEffect(() => {
    if (!openMenu) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    }
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target)) return;
      if (resolveTriggerEl()?.contains(target)) return;
      close();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [openMenu, close, resolveTriggerEl]);

  useEffect(() => {
    if (!openMenu) return;
    const raf = requestAnimationFrame(() => {
      const first = menuRef.current?.querySelector<HTMLButtonElement>("button[role='menuitem']:not(:disabled)");
      first?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [openMenu]);

  if (!openMenu || !hasTrigger) return null;

  return createPortal(
    <div
      key={`${openMenu.kind}:${openMenu.tableKey}:${openMenu.index ?? "corner"}`}
      ref={(node) => {
        refs.setFloating(node);
        menuRef.current = node;
      }}
      role="menu"
      aria-orientation="vertical"
      className="tiptap-table-menu"
      style={floatingStyles}
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        e.preventDefault();
      }}
    >
      {sections.map((section, index) => (
        <SectionRenderer key={index} section={section} showSeparator={index > 0} />
      ))}
    </div>,
    document.body,
  );
}

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
}

function MenuItem({ icon, label, onSelect, disabled, danger }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className={`tiptap-table-menu-item${danger ? " is-danger" : ""}`}
      onMouseDown={(e) => {
        e.preventDefault();
      }}
      onClick={(e) => {
        e.preventDefault();
        if (disabled) return;
        onSelect();
      }}
    >
      <span className="tiptap-table-menu-item-icon">{icon}</span>
      <span className="tiptap-table-menu-item-label">{label}</span>
    </button>
  );
}

function MenuSeparator() {
  return <div className="tiptap-table-menu-sep" role="separator" />;
}

function SectionRenderer({ section, showSeparator }: { section: TableMenuSection; showSeparator: boolean }) {
  return (
    <>
      {showSeparator && <MenuSeparator />}
      {section.map((action) => (
        <ActionMenuItem key={action.key} action={action} />
      ))}
    </>
  );
}

function ActionMenuItem({ action }: { action: TableMenuAction }) {
  return (
    <MenuItem
      icon={action.icon}
      label={action.label}
      onSelect={action.onSelect}
      disabled={action.disabled}
      danger={action.danger}
    />
  );
}
