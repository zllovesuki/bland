import { addColumnAfter, addRowAfter, TableMap } from "@tiptap/pm/tables";
import type { EditorState, PluginView } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import { TABLE_ADD_PILL_SIZE_PX, TABLE_HANDLE_OFFSET_PX } from "./constants";
import {
  buildColumnEntries,
  createLocalRectConverter,
  findTableForWrapper,
  findLogicalCellElement,
  type ColumnEntry,
  type LocalRect,
} from "./dom";
import { completeDrag, createColumnDragState, createRowDragState, type DragState, updateDragState } from "./reorder";
import { setCaretInCell } from "./selection";
import {
  activeCellInfo,
  createOpenMenuState,
  createTableHandlesPluginState,
  tableHandlesKey,
  tableKeyFromPos,
  type ActiveCellInfo,
  type OpenMenuState,
  type TableHandlesMeta,
} from "./state";

interface WrapperState {
  overlay: HTMLElement;
  dropIndicator: HTMLElement;
  onScroll: () => void;
}

interface OverlayContext {
  wrapper: HTMLElement;
  overlay: HTMLElement;
  info: { pos: number; node: PMNode };
  tableKey: string;
  rows: HTMLTableRowElement[];
  columnEntries: ColumnEntry[];
  toLocal: ReturnType<typeof createLocalRectConverter>;
  wrapperLocal: { left: number; right: number; top: number; bottom: number };
  tableLocal: { left: number; right: number; top: number; bottom: number };
  visibleTableLeft: number;
  visibleTableRight: number;
  visibleTableTop: number;
  visibleTableBottom: number;
  activeInThisTable: ActiveCellInfo | null;
  menuOnThisTable: OpenMenuState | null;
  isTyping: boolean;
  tableWidth: number;
  tableHeight: number;
  activeCellLocal: LocalRect | null;
}

function clamp(value: number, min: number, max: number): number {
  if (max <= min) return min;
  return Math.min(Math.max(value, min), max);
}

function intersectsAxis(start: number, end: number, visibleStart: number, visibleEnd: number): boolean {
  return end > visibleStart && start < visibleEnd;
}

export class TableOverlayView implements PluginView {
  view: EditorView;
  wrappers = new Map<HTMLElement, WrapperState>();
  dragState: DragState | null = null;
  activeCell: ActiveCellInfo | null = null;
  rafHandle: number | null = null;
  resizeObserver: ResizeObserver | null = null;
  dragCleanup: (() => void) | null = null;
  cleanupFns: Array<() => void> = [];

  constructor(view: EditorView) {
    this.view = view;
    this.resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => this.scheduleSync()) : null;
    this.activeCell = activeCellInfo(view.state);
    this.scheduleSync();

    const onWindowChange = () => this.scheduleSync();
    window.addEventListener("resize", onWindowChange);
    window.addEventListener("scroll", onWindowChange, true);
    this.cleanupFns.push(() => {
      window.removeEventListener("resize", onWindowChange);
      window.removeEventListener("scroll", onWindowChange, true);
    });
  }

  update(view: EditorView, _prevState?: EditorState) {
    this.view = view;
    if (this.dragState && _prevState && _prevState.doc !== view.state.doc) {
      this.endDrag();
    }

    const prevActive = this.activeCell;
    const nextActive = activeCellInfo(view.state);
    this.activeCell = nextActive;

    if (prevActive?.tableKey !== nextActive?.tableKey && tableHandlesKey.getState(view.state)?.isTyping) {
      this.dispatchMeta({ isTyping: false });
    }

    this.sync();
  }

  destroy() {
    if (this.rafHandle !== null) cancelAnimationFrame(this.rafHandle);
    this.rafHandle = null;

    this.cleanupFns.forEach((fn) => fn());
    this.cleanupFns = [];

    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    this.dragCleanup?.();
    this.dragCleanup = null;
    this.dragState = null;

    for (const [wrapper, state] of this.wrappers.entries()) {
      wrapper.removeEventListener("scroll", state.onScroll);
      state.overlay.remove();
      wrapper.classList.remove("has-table-handles");
    }
    this.wrappers.clear();
  }

  private dispatchMeta(meta: TableHandlesMeta) {
    if (this.view.isDestroyed) return;
    this.view.dispatch(this.view.state.tr.setMeta(tableHandlesKey, meta));
  }

  private overlayHost(): HTMLElement {
    return (this.view.dom.offsetParent as HTMLElement | null) ?? this.view.dom.parentElement ?? this.view.dom;
  }

  private scheduleSync() {
    if (this.rafHandle !== null) return;
    this.rafHandle = requestAnimationFrame(() => {
      this.rafHandle = null;
      this.sync();
    });
  }

  private sync() {
    if (this.view.isDestroyed) return;
    if (!this.view.editable) {
      this.teardown();
      return;
    }

    const seen = new Set<HTMLElement>();
    this.view.dom.querySelectorAll<HTMLElement>(".tableWrapper").forEach((wrapper) => {
      seen.add(wrapper);
      this.syncWrapper(wrapper);
    });

    for (const [wrapper, state] of this.wrappers.entries()) {
      if (!seen.has(wrapper)) this.removeWrapperState(wrapper, state);
    }
  }

  private teardown() {
    for (const [wrapper, state] of this.wrappers.entries()) {
      this.removeWrapperState(wrapper, state);
    }
    this.wrappers.clear();
  }

  private removeWrapperState(wrapper: HTMLElement, state: WrapperState) {
    wrapper.removeEventListener("scroll", state.onScroll);
    state.overlay.remove();
    wrapper.classList.remove("has-table-handles");
    this.resizeObserver?.unobserve(wrapper);
    this.wrappers.delete(wrapper);
  }

  private ensureWrapperState(wrapper: HTMLElement): WrapperState {
    const existing = this.wrappers.get(wrapper);
    if (existing) return existing;

    const overlay = document.createElement("div");
    overlay.className = "tiptap-table-handles";
    overlay.contentEditable = "false";

    const dropIndicator = document.createElement("div");
    dropIndicator.className = "tiptap-table-drop-indicator";
    dropIndicator.style.display = "none";
    overlay.appendChild(dropIndicator);

    wrapper.classList.add("has-table-handles");
    this.overlayHost().appendChild(overlay);
    this.resizeObserver?.observe(wrapper);

    const onScroll = () => this.scheduleSync();
    wrapper.addEventListener("scroll", onScroll, { passive: true });

    const state: WrapperState = { overlay, dropIndicator, onScroll };
    this.wrappers.set(wrapper, state);
    return state;
  }

  private syncWrapper(wrapper: HTMLElement) {
    const table = wrapper.querySelector<HTMLTableElement>(":scope > table");
    if (!table) return;

    const state = this.ensureWrapperState(wrapper);
    state.overlay.replaceChildren(state.dropIndicator);
    state.dropIndicator.style.display = "none";

    const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>(":scope > tbody > tr"));
    if (rows.length === 0) return;
    const firstRow = rows[0];
    if (!firstRow) return;

    const info = findTableForWrapper(this.view, wrapper);
    if (!info) return;

    const pluginState = tableHandlesKey.getState(this.view.state) ?? createTableHandlesPluginState();
    const tableKey = tableKeyFromPos(info.pos);
    const activeInThisTable = this.activeCell?.tableKey === tableKey ? this.activeCell : null;
    const menuOnThisTable = pluginState.openMenu?.tableKey === tableKey ? pluginState.openMenu : null;
    if (!activeInThisTable && !menuOnThisTable && !this.dragState) return;

    const toLocal = createLocalRectConverter(this.overlayHost());
    const wrapperLocal = toLocal(wrapper.getBoundingClientRect());
    const tableLocal = toLocal(table.getBoundingClientRect());
    const activeCellEl = activeInThisTable
      ? findLogicalCellElement(rows, activeInThisTable.row, activeInThisTable.col)
      : null;
    const activeCellLocal = activeCellEl ? toLocal(activeCellEl.getBoundingClientRect()) : null;
    const map = TableMap.get(info.node);
    const ctx: OverlayContext = {
      wrapper,
      overlay: state.overlay,
      info,
      tableKey,
      rows,
      columnEntries: buildColumnEntries(firstRow),
      toLocal,
      wrapperLocal,
      tableLocal,
      visibleTableLeft: Math.max(tableLocal.left, wrapperLocal.left),
      visibleTableRight: Math.min(tableLocal.right, wrapperLocal.right),
      visibleTableTop: Math.max(tableLocal.top, wrapperLocal.top),
      visibleTableBottom: Math.min(tableLocal.bottom, wrapperLocal.bottom),
      activeInThisTable,
      menuOnThisTable,
      isTyping: pluginState.isTyping,
      tableWidth: map.width,
      tableHeight: map.height,
      activeCellLocal,
    };

    this.renderRowHandles(ctx);
    this.renderColumnHandles(ctx);
    this.renderCornerHandle(ctx);
    this.renderAddButtons(ctx);
  }

  private renderRowHandles(ctx: OverlayContext) {
    ctx.rows.forEach((row, rowIndex) => {
      const shouldShow =
        (ctx.menuOnThisTable?.kind === "row" && ctx.menuOnThisTable.index === rowIndex) ||
        (!ctx.isTyping && ctx.activeInThisTable?.row === rowIndex);
      if (!shouldShow) return;

      const rect = ctx.toLocal(row.getBoundingClientRect());
      const handle = this.createHandleButton("tiptap-table-row-handle", `Row ${rowIndex + 1} actions`, "Row actions");
      handle.dataset.tableHandleKind = "row";
      handle.dataset.tableKey = ctx.tableKey;
      handle.dataset.index = String(rowIndex);
      handle.style.top = `${rect.top}px`;
      handle.style.left = `${ctx.visibleTableLeft - TABLE_HANDLE_OFFSET_PX}px`;
      handle.style.height = `${rect.height}px`;
      handle.addEventListener("pointerdown", (event) => this.onRowHandlePointerDown(event, ctx.wrapper, rowIndex));
      handle.addEventListener("keydown", (event) =>
        this.onHandleKeyDown(event, "row", rowIndex, ctx.info.pos, ctx.info.node),
      );
      ctx.overlay.appendChild(handle);
    });
  }

  private renderColumnHandles(ctx: OverlayContext) {
    ctx.columnEntries.forEach((entry) => {
      const shouldShow =
        (ctx.menuOnThisTable?.kind === "col" && ctx.menuOnThisTable.index === entry.logicalCol) ||
        (!ctx.isTyping && ctx.activeInThisTable?.col === entry.logicalCol);
      if (!shouldShow) return;

      const rect = ctx.toLocal(entry.domCell.getBoundingClientRect());
      const visibleLeft = Math.max(rect.left, ctx.wrapperLocal.left);
      const visibleRight = Math.min(rect.right, ctx.wrapperLocal.right);
      const visibleWidth = Math.max(0, visibleRight - visibleLeft);
      if (visibleWidth === 0) return;

      const handle = this.createHandleButton(
        "tiptap-table-col-handle",
        `Column ${entry.logicalCol + 1} actions`,
        "Column actions",
      );
      handle.dataset.tableHandleKind = "col";
      handle.dataset.tableKey = ctx.tableKey;
      handle.dataset.index = String(entry.logicalCol);
      handle.dataset.colspan = String(entry.colspan);
      handle.style.left = `${visibleLeft}px`;
      handle.style.top = `${ctx.tableLocal.top - TABLE_HANDLE_OFFSET_PX}px`;
      handle.style.width = `${visibleWidth}px`;
      handle.addEventListener("pointerdown", (event) =>
        this.onColHandlePointerDown(event, ctx.wrapper, entry.logicalCol),
      );
      handle.addEventListener("keydown", (event) =>
        this.onHandleKeyDown(event, "col", entry.logicalCol, ctx.info.pos, ctx.info.node),
      );
      ctx.overlay.appendChild(handle);
    });
  }

  private renderCornerHandle(ctx: OverlayContext) {
    const shouldShow = ctx.menuOnThisTable?.kind === "corner" || (!ctx.isTyping && !!ctx.activeInThisTable);
    if (!shouldShow) return;

    const corner = this.createHandleButton("tiptap-table-corner-handle", "Table actions", "Table actions");
    corner.dataset.tableHandleKind = "corner";
    corner.dataset.tableKey = ctx.tableKey;
    corner.style.left = `${ctx.visibleTableLeft - TABLE_HANDLE_OFFSET_PX}px`;
    corner.style.top = `${ctx.tableLocal.top - TABLE_HANDLE_OFFSET_PX}px`;
    corner.addEventListener("mousedown", (event) => event.preventDefault());
    corner.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.openMenuFromHandle("corner", null, ctx.info.pos, ctx.info.node);
    });
    corner.addEventListener("keydown", (event) =>
      this.onHandleKeyDown(event, "corner", null, ctx.info.pos, ctx.info.node),
    );
    ctx.overlay.appendChild(corner);
  }

  private renderAddButtons(ctx: OverlayContext) {
    const activeCell = ctx.activeInThisTable;
    const activeCellLocal = ctx.activeCellLocal;
    if (ctx.isTyping || this.dragState || !activeCell || !activeCellLocal || ctx.menuOnThisTable) return;
    if (
      !intersectsAxis(activeCellLocal.left, activeCellLocal.right, ctx.visibleTableLeft, ctx.visibleTableRight) ||
      !intersectsAxis(activeCellLocal.top, activeCellLocal.bottom, ctx.visibleTableTop, ctx.visibleTableBottom)
    ) {
      return;
    }

    const showAddCol = activeCell.col === ctx.tableWidth - 1;
    const showAddRow = activeCell.row === ctx.tableHeight - 1;
    const pillHalf = TABLE_ADD_PILL_SIZE_PX / 2;

    if (showAddCol) {
      const addCol = document.createElement("button");
      addCol.type = "button";
      addCol.className = "tiptap-table-add-col";
      addCol.setAttribute("aria-label", "Add column");
      addCol.setAttribute("title", "Add column");
      addCol.textContent = "+";
      addCol.style.left = `${ctx.visibleTableRight - pillHalf}px`;
      addCol.style.top = `${clamp(
        activeCellLocal.top + activeCellLocal.height / 2 - pillHalf,
        ctx.visibleTableTop,
        ctx.visibleTableBottom - TABLE_ADD_PILL_SIZE_PX,
      )}px`;
      addCol.addEventListener("mousedown", (event) => event.preventDefault());
      addCol.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.addColumnAtEnd(ctx.wrapper);
      });
      ctx.overlay.appendChild(addCol);
    }

    if (showAddRow) {
      const addRow = document.createElement("button");
      addRow.type = "button";
      addRow.className = "tiptap-table-add-row";
      addRow.setAttribute("aria-label", "Add row");
      addRow.setAttribute("title", "Add row");
      addRow.textContent = "+";
      addRow.style.top = `${clamp(activeCellLocal.bottom - pillHalf, ctx.visibleTableTop, ctx.wrapperLocal.bottom)}px`;
      addRow.style.left = `${clamp(
        activeCellLocal.left + activeCellLocal.width / 2 - pillHalf,
        ctx.visibleTableLeft,
        ctx.visibleTableRight - TABLE_ADD_PILL_SIZE_PX,
      )}px`;
      addRow.addEventListener("mousedown", (event) => event.preventDefault());
      addRow.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.addRowAtEnd(ctx.wrapper);
      });
      ctx.overlay.appendChild(addRow);
    }
  }

  private createHandleButton(className: string, ariaLabel: string, title: string) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.setAttribute("aria-label", ariaLabel);
    button.setAttribute("title", title);
    return button;
  }

  private openMenuFromHandle(kind: OpenMenuState["kind"], index: number | null, tablePos: number, table: PMNode) {
    const openMenu = createOpenMenuState(kind, index, tablePos, table);
    if (!openMenu) return;
    this.dispatchMeta({ openMenu });
  }

  private onHandleKeyDown(
    event: KeyboardEvent,
    kind: OpenMenuState["kind"],
    index: number | null,
    tablePos: number,
    table: PMNode,
  ) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    this.openMenuFromHandle(kind, index, tablePos, table);
  }

  private addColumnAtEnd(wrapper: HTMLElement) {
    const info = findTableForWrapper(this.view, wrapper);
    if (!info) return;

    const map = TableMap.get(info.node);
    setCaretInCell(this.view, info.node, info.pos, map.height - 1, map.width - 1);
    addColumnAfter(this.view.state, this.view.dispatch.bind(this.view));
    const nextTable = this.view.state.doc.nodeAt(info.pos);
    if (!nextTable || nextTable.type.spec.tableRole !== "table") return;

    const nextMap = TableMap.get(nextTable);
    setCaretInCell(this.view, nextTable, info.pos, nextMap.height - 1, nextMap.width - 1);
    requestAnimationFrame(() => {
      wrapper.scrollLeft = wrapper.scrollWidth;
      this.scheduleSync();
    });
  }

  private addRowAtEnd(wrapper: HTMLElement) {
    const info = findTableForWrapper(this.view, wrapper);
    if (!info) return;

    const map = TableMap.get(info.node);
    setCaretInCell(this.view, info.node, info.pos, map.height - 1, map.width - 1);
    addRowAfter(this.view.state, this.view.dispatch.bind(this.view));
    const nextTable = this.view.state.doc.nodeAt(info.pos);
    if (!nextTable || nextTable.type.spec.tableRole !== "table") return;

    const nextMap = TableMap.get(nextTable);
    setCaretInCell(this.view, nextTable, info.pos, nextMap.height - 1, nextMap.width - 1);
  }

  private onRowHandlePointerDown(event: PointerEvent, wrapper: HTMLElement, rowIndex: number) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const dragState = createRowDragState(this.view, wrapper, rowIndex, event.pointerId, event.clientX, event.clientY);
    if (!dragState) return;

    this.beginDrag(dragState);
    (event.currentTarget as Element)?.setPointerCapture?.(event.pointerId);
  }

  private onColHandlePointerDown(event: PointerEvent, wrapper: HTMLElement, logicalCol: number) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const dragState = createColumnDragState(
      this.view,
      wrapper,
      logicalCol,
      event.pointerId,
      event.clientX,
      event.clientY,
    );
    if (!dragState) return;

    this.beginDrag(dragState);
    (event.currentTarget as Element)?.setPointerCapture?.(event.pointerId);
  }

  private beginDrag(state: DragState) {
    this.dragState = state;

    const onMove = (event: PointerEvent) => this.onDragMove(event);
    const onUp = (event: PointerEvent) => this.onDragUp(event);
    const onCancel = () => this.endDrag();

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);

    this.dragCleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };

    state.wrapper.classList.add("is-dragging-table");
  }

  private endDrag() {
    if (!this.dragState) return;

    const wrapperState = this.wrappers.get(this.dragState.wrapper);
    if (wrapperState) wrapperState.dropIndicator.style.display = "none";

    this.dragState.wrapper.classList.remove("is-dragging-table");
    this.dragState = null;
    this.dragCleanup?.();
    this.dragCleanup = null;
    this.sync();
  }

  private onDragMove(event: PointerEvent) {
    const state = this.dragState;
    if (!state || event.pointerId !== state.pointerId) return;

    const wrapperState = this.wrappers.get(state.wrapper);
    if (!wrapperState) return;

    const indicator = updateDragState(
      this.view,
      state,
      event.clientX,
      event.clientY,
      createLocalRectConverter(this.overlayHost()),
    );
    if (!indicator) {
      wrapperState.dropIndicator.style.display = "none";
      return;
    }

    wrapperState.dropIndicator.classList.toggle("is-row", indicator.orientation === "row");
    wrapperState.dropIndicator.classList.toggle("is-column", indicator.orientation === "column");
    wrapperState.dropIndicator.style.display = "block";
    wrapperState.dropIndicator.style.top = `${indicator.top}px`;
    wrapperState.dropIndicator.style.left = `${indicator.left}px`;
    wrapperState.dropIndicator.style.width = `${indicator.width}px`;
    wrapperState.dropIndicator.style.height = `${indicator.height}px`;
  }

  private onDragUp(event: PointerEvent) {
    const state = this.dragState;
    if (!state || event.pointerId !== state.pointerId) return;

    const openMenu = completeDrag(this.view, state);
    this.endDrag();
    if (openMenu) {
      const table = this.view.state.doc.nodeAt(openMenu.tablePos);
      if (!table || table.type.spec.tableRole !== "table") return;
      this.openMenuFromHandle(openMenu.kind, openMenu.index, openMenu.tablePos, table);
    }
  }
}
