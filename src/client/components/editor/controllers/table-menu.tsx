import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  useDismiss,
  useFloating,
  useInteractions,
  type VirtualElement,
} from "@floating-ui/react";
import { useTiptap, useTiptapState } from "@tiptap/react";
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
import { preserveEditorSelectionOnMouseDown } from "./menu/popover";

interface MenuDerivedState {
  openMenu: OpenMenuState | null;
  rowCount: number;
  colCount: number;
  canMerge: boolean;
  canSplit: boolean;
  canResetWidths: boolean;
}

export function TableMenu() {
  const { editor } = useTiptap();
  const state = useTiptapState<MenuDerivedState>((ctx) => {
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
  });

  const { openMenu } = state;
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [hasTrigger, setHasTrigger] = useState(false);
  const selector = useMemo(() => tableHandleSelector(openMenu), [openMenu]);

  const resolveTriggerEl = useCallback(() => {
    if (!selector) return null;
    return document.querySelector<HTMLElement>(selector);
  }, [selector]);

  const close = useCallback(
    (focusTrigger = true) => {
      editor.view.dispatch(editor.view.state.tr.setMeta(tableHandlesKey, { openMenu: "close" }));
      if (focusTrigger) {
        resolveTriggerEl()?.focus();
      }
    },
    [editor, resolveTriggerEl],
  );

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
    };
  }, [resolveTriggerEl, selector]);

  const { context, refs, floatingStyles } = useFloating({
    open: !!openMenu && hasTrigger,
    onOpenChange(nextOpen) {
      if (!nextOpen) close();
    },
    placement: openMenu?.kind === "row" ? "right-start" : openMenu?.kind === "col" ? "bottom-start" : "bottom-end",
    strategy: "fixed",
    middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  useLayoutEffect(() => {
    // Keep the table menu's virtual reference stable and local to this component.
    // Table handles are real DOM affordances, so useFloating works well here, but
    // feeding it a freshly created virtual element every render causes internal
    // React state churn and can recurse into a maximum update depth error.
    refs.setReference(virtualReference);
  }, [refs, virtualReference]);

  const dismiss = useDismiss(context, {
    enabled: !!openMenu && hasTrigger,
    escapeKey: true,
    outsidePress: (event) => {
      const target = event.target as Node | null;
      if (!target) return false;
      if (menuRef.current?.contains(target)) return false;
      if (resolveTriggerEl()?.contains(target)) return false;
      return true;
    },
  });
  const { getFloatingProps } = useInteractions([dismiss]);

  useEffect(() => {
    if (!openMenu) return;
    const raf = requestAnimationFrame(() => {
      const first = menuRef.current?.querySelector<HTMLButtonElement>("button[role='menuitem']:not(:disabled)");
      first?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [openMenu]);

  if (!editor || !openMenu || !hasTrigger) return null;

  return (
    <FloatingPortal>
      <div
        key={`${openMenu.kind}:${openMenu.tableKey}:${openMenu.index ?? "corner"}`}
        ref={(node) => {
          refs.setFloating(node);
          menuRef.current = node;
        }}
        role="menu"
        aria-orientation="vertical"
        className="tiptap-menu-surface tiptap-table-menu"
        style={{ ...floatingStyles, zIndex: 60 }}
        {...getFloatingProps({
          onMouseDownCapture: (e) => preserveEditorSelectionOnMouseDown(e),
        })}
      >
        {sections.map((section, index) => (
          <SectionRenderer key={index} section={section} showSeparator={index > 0} />
        ))}
      </div>
    </FloatingPortal>
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
      className={`tiptap-menu-item tiptap-table-menu-item${danger ? " is-danger" : ""}`}
      onMouseDown={(e) => {
        e.preventDefault();
      }}
      onClick={(e) => {
        e.preventDefault();
        if (disabled) return;
        onSelect();
      }}
    >
      <span className="tiptap-menu-item-icon tiptap-table-menu-item-icon">{icon}</span>
      <span className="tiptap-menu-item-label tiptap-table-menu-item-label">{label}</span>
    </button>
  );
}

function MenuSeparator() {
  return <div className="tiptap-menu-separator tiptap-table-menu-sep" role="separator" />;
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
