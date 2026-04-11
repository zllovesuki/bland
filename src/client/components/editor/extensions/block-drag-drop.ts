import { Extension } from "@tiptap/core";
import type { Slice } from "@tiptap/pm/model";
import { NodeSelection, Plugin, PluginKey, Selection, TextSelection } from "@tiptap/pm/state";
import { dropPoint } from "@tiptap/pm/transform";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import "../styles/block-drag-drop.css";

export interface TopLevelBlockRect {
  pos: number;
  end: number;
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface BlockDragDropState {
  target: number | null;
  sourcePos: number | null;
  sourceEnd: number | null;
}

interface DragPreview {
  dom: HTMLElement;
  marginTop: string;
  marginBottom: string;
}

const blockDragDropKey = new PluginKey<BlockDragDropState>("blockDragDrop");
const dragTargets = new WeakMap<EditorView, number | null>();
const dragPreviews = new WeakMap<EditorView, DragPreview>();

function getDroppedTextblockCursorPos(selection: Selection): number | null {
  if (!(selection instanceof NodeSelection) || !selection.node.isTextblock) {
    return null;
  }

  return Math.max(selection.from + 1, selection.to - 1);
}

function normalizeMovedTextblockDrop(view: EditorView) {
  view.updateState(view.state);

  const cursorPos = getDroppedTextblockCursorPos(view.state.selection);
  if (cursorPos === null) return;

  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, cursorPos)).setMeta("addToHistory", false),
  );
}

// Read the current top-level block boxes from the DOM so drag placement is based
// on visible layout rather than ProseMirror caret heuristics in the gaps between blocks.
function getTopLevelBlockRects(view: EditorView): TopLevelBlockRect[] {
  const blocks: TopLevelBlockRect[] = [];

  view.state.doc.forEach((node, pos) => {
    const dom = view.nodeDOM(pos);
    if (!(dom instanceof HTMLElement)) return;

    const rect = dom.getBoundingClientRect();
    if (rect.height <= 0 && rect.width <= 0) return;

    blocks.push({
      pos,
      end: pos + node.nodeSize,
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
    });
  });

  return blocks;
}

// Convert a screen-space Y coordinate into a top-level insertion slot.
// Above a block means "before it", lower half means "after it", and the gap
// before the next block belongs to the slot before that next block.
export function resolveTopLevelDropTarget(blocks: TopLevelBlockRect[], y: number): number | null {
  if (!blocks.length || !Number.isFinite(y)) return null;

  for (const block of blocks) {
    if (y < block.top) return block.pos;
    if (y <= block.bottom) {
      return y < (block.top + block.bottom) / 2 ? block.pos : block.end;
    }
  }

  return blocks[blocks.length - 1]?.end ?? null;
}

function resolveMovedBlockDropPos(view: EditorView, event: DragEvent): number | null {
  return resolveTopLevelDropTarget(getTopLevelBlockRects(view), event.clientY);
}

function resolveDropCursorTarget(view: EditorView, event: DragEvent): number | null {
  const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
  if (!pos) return null;

  const node = pos.inside >= 0 ? view.state.doc.nodeAt(pos.inside) : null;
  const disableDropCursor = node?.type.spec.disableDropCursor;
  const disabled = typeof disableDropCursor === "function" ? disableDropCursor(view, pos, event) : disableDropCursor;

  if (disabled) return null;

  if (view.dragging?.slice) {
    return resolveMovedBlockDropPos(view, event) ?? dropPoint(view.state.doc, pos.pos, view.dragging.slice) ?? pos.pos;
  }

  return pos.pos;
}

// Render the dragged block in-flow at the current target slot so the preview
// matches where the block will land instead of showing a separate floating cue.
function createDropPlaceholder(view: EditorView) {
  const wrapper = document.createElement("div");
  wrapper.className = "tiptap tiptap-drop-placeholder";
  wrapper.contentEditable = "false";

  const preview = dragPreviews.get(view);
  if (preview) {
    wrapper.style.marginTop = preview.marginTop;
    wrapper.style.marginBottom = preview.marginBottom;

    const clone = preview.dom.cloneNode(true) as HTMLElement;
    clone.style.marginTop = "0";
    clone.style.marginBottom = "0";
    wrapper.appendChild(clone);
  }

  return wrapper;
}

// When the target is immediately before/after the source, decorating the source
// itself is less jumpy than rendering a second placeholder widget next to it.
function isAdjacentToSource(state: BlockDragDropState): boolean {
  return (
    state.target !== null &&
    state.sourcePos !== null &&
    state.sourceEnd !== null &&
    (state.target === state.sourcePos || state.target === state.sourceEnd)
  );
}

class BlockDragPreviewView {
  target: number | null = null;
  timeout = -1;
  handlers: Array<{ name: string; handler: (event: Event) => void }>;

  constructor(readonly editorView: EditorView) {
    this.handlers = ["dragover", "dragend", "drop", "dragleave"].map((name) => {
      const handler = (event: Event) => {
        (this as unknown as Record<string, (event: Event) => void>)[name](event);
      };
      editorView.dom.addEventListener(name, handler);
      return { name, handler };
    });
  }

  destroy() {
    this.handlers.forEach(({ name, handler }) => this.editorView.dom.removeEventListener(name, handler));
    this.setTarget(null);
  }

  update() {
    if (this.target !== null) {
      if (this.target > this.editorView.state.doc.content.size) {
        this.setTarget(null);
      }
    }
  }

  setTarget(pos: number | null) {
    if (pos === this.target) return;
    this.target = pos;
    this.editorView.dispatch(
      this.editorView.state.tr.setMeta(blockDragDropKey, { target: pos }).setMeta("addToHistory", false),
    );
  }

  scheduleRemoval(timeout: number) {
    clearTimeout(this.timeout);
    this.timeout = window.setTimeout(() => this.setTarget(null), timeout);
  }

  dragover(event: Event) {
    if (!this.editorView.editable) return;

    const target = resolveDropCursorTarget(this.editorView, event as DragEvent);
    if (target === null) return;

    dragTargets.set(this.editorView, target);
    this.setTarget(target);
    this.scheduleRemoval(5000);
  }

  dragend() {
    dragTargets.delete(this.editorView);
    this.scheduleRemoval(20);
  }

  drop() {
    dragTargets.delete(this.editorView);
    this.scheduleRemoval(20);
  }

  dragleave(event: Event) {
    if (!this.editorView.dom.contains((event as DragEvent).relatedTarget as Node | null)) {
      dragTargets.delete(this.editorView);
      this.setTarget(null);
    }
  }
}

// Use the stored slot target for internal block moves so the actual insertion
// always matches the in-flow placeholder the user is dragging against.
function handleMovedDrop(view: EditorView, event: DragEvent, slice: Slice, moved: boolean): boolean {
  if (!moved || !slice.content.size) return false;

  const insertPos = dragTargets.get(view) ?? resolveMovedBlockDropPos(view, event);
  if (insertPos === null) return false;

  event.preventDefault();

  const { tr } = view.state;
  const dragging = view.dragging as { node?: NodeSelection } | null;

  if (dragging?.node) {
    dragging.node.replace(tr);
  } else {
    tr.deleteSelection();
  }

  const pos = tr.mapping.map(insertPos);
  const isNode = slice.openStart === 0 && slice.openEnd === 0 && slice.content.childCount === 1;
  const beforeInsert = tr.doc;

  if (isNode) {
    tr.replaceRangeWith(pos, pos, slice.content.firstChild!);
  } else {
    tr.replaceRange(pos, pos, slice);
  }

  if (tr.doc.eq(beforeInsert)) return true;

  const $pos = tr.doc.resolve(pos);
  if (
    isNode &&
    NodeSelection.isSelectable(slice.content.firstChild!) &&
    $pos.nodeAfter &&
    $pos.nodeAfter.sameMarkup(slice.content.firstChild!)
  ) {
    tr.setSelection(new NodeSelection($pos));
  } else {
    tr.setSelection(Selection.near($pos));
  }

  view.focus();
  view.dispatch(tr.setMeta("uiEvent", "drop"));

  requestAnimationFrame(() => {
    if (!view.isDestroyed) {
      normalizeMovedTextblockDrop(view);
    }
  });

  dragTargets.delete(view);
  return true;
}

export const BlockDragDropBehavior = Extension.create({
  name: "blockDragDropBehavior",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: blockDragDropKey,
        state: {
          init: (): BlockDragDropState => ({ target: null, sourcePos: null, sourceEnd: null }),
          apply(tr, value) {
            const meta = tr.getMeta(blockDragDropKey) as Partial<BlockDragDropState> | undefined;
            if (!meta) return value;
            return {
              target: "target" in meta ? (meta.target ?? null) : value.target,
              sourcePos: "sourcePos" in meta ? (meta.sourcePos ?? null) : value.sourcePos,
              sourceEnd: "sourceEnd" in meta ? (meta.sourceEnd ?? null) : value.sourceEnd,
            };
          },
        },
        props: {
          handleDrop: handleMovedDrop,
          decorations(state) {
            const pluginState = blockDragDropKey.getState(state);
            if (!pluginState) return null;

            const decorations = [];
            const hasSource = pluginState.sourcePos !== null && pluginState.sourceEnd !== null;
            const hasTarget = pluginState.target !== null;
            const adjacentToSource = isAdjacentToSource(pluginState);

            if (hasSource && hasTarget && pluginState.sourcePos !== null && pluginState.sourceEnd !== null) {
              decorations.push(
                Decoration.node(
                  pluginState.sourcePos,
                  pluginState.sourceEnd,
                  adjacentToSource
                    ? { class: "tiptap-drop-placeholder-source" }
                    : { class: "tiptap-drag-source-hidden" },
                ),
              );
            }

            if (!hasTarget || adjacentToSource) {
              return decorations.length ? DecorationSet.create(state.doc, decorations) : null;
            }

            const target = pluginState.target;
            decorations.push(
              Decoration.widget(target!, (view) => createDropPlaceholder(view), {
                side: -1,
                ignoreSelection: true,
                key: `drag-drop-placeholder-${target}`,
              }),
            );

            return DecorationSet.create(state.doc, decorations);
          },
        },
        view: (editorView) => new BlockDragPreviewView(editorView),
      }),
    ];
  },
});

// Capture a static DOM snapshot of the dragged source block. The live source
// may be hidden while dragging away from it, so the placeholder needs its own copy.
export function setDraggedBlockPreview(view: EditorView, dom: HTMLElement, sourcePos: number, sourceEnd: number) {
  const styles = window.getComputedStyle(dom);
  dragPreviews.set(view, {
    dom: dom.cloneNode(true) as HTMLElement,
    marginTop: styles.marginTop,
    marginBottom: styles.marginBottom,
  });
  view.dispatch(
    view.state.tr.setMeta(blockDragDropKey, { sourcePos, sourceEnd, target: null }).setMeta("addToHistory", false),
  );
}

export function clearDraggedBlockPreview(view: EditorView) {
  dragPreviews.delete(view);
  view.dispatch(
    view.state.tr
      .setMeta(blockDragDropKey, { sourcePos: null, sourceEnd: null, target: null })
      .setMeta("addToHistory", false),
  );
}

export { getDroppedTextblockCursorPos };
