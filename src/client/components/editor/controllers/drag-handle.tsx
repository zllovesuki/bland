import { useCallback, useEffect, useRef, useState } from "react";
import { DragHandle as DragHandleReact } from "@tiptap/extension-drag-handle-react";
import { offset } from "@floating-ui/dom";
import type { Node as PMNode } from "@tiptap/pm/model";
import { useTiptap } from "@tiptap/react";
import { ArrowDown, ArrowUp, Menu, Plus, Trash2 } from "lucide-react";
import { useEditorRuntime } from "../editor-runtime-context";
import { primeTopLevelBlockDragState } from "../lib/block-drag-state";
import { prepareBlockDragPreview } from "../lib/block-drag-preview";
import {
  canMoveTopLevelBlock,
  deleteTopLevelBlock,
  getCurrentTopLevelBlock,
  moveTopLevelBlock,
} from "../lib/block-actions";
import { launchPageMentionPicker } from "../lib/page-mention/open-picker";
import { launchEmojiPicker } from "./emoji/insert-panel";
import { insertImageFromSlashMenu } from "./image/insert-panel";
import { getSlashMenuItems, type SlashMenuPageMentionConfig } from "./slash/items";
import { mountSlashMenu, type SlashMenuOverlayHandle } from "./slash/overlay";
import "../styles/drag-handle.css";

const positionConfig = {
  placement: "left-start" as const,
  strategy: "absolute" as const,
  middleware: [offset({ mainAxis: 8, crossAxis: 2 })],
};

export function DragHandle() {
  const { editor } = useTiptap();
  const nodePos = useRef(-1);
  const nodeBid = useRef<string | null>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const { workspaceId, pageId, shareToken, readOnly, canInsertPageMentions } = useEditorRuntime();
  const [menuBid, setMenuBid] = useState<string | null>(null);
  const pageMentionRef = useRef<SlashMenuPageMentionConfig | null>(null);
  pageMentionRef.current = canInsertPageMentions()
    ? {
        isAvailable: ({ editor: currentEditor }) => canInsertPageMentions() && currentEditor.isEditable,
        openPicker: ({ editor: currentEditor, range }) => {
          launchPageMentionPicker(currentEditor, { range, currentPageId: pageId, workspaceId });
        },
      }
    : null;

  const onNodeChange = useCallback(({ node, pos }: { node: PMNode | null; pos: number }) => {
    nodePos.current = pos;
    nodeBid.current = node && typeof node.attrs.bid === "string" ? node.attrs.bid : null;
  }, []);

  const setHandleLocked = useCallback(
    (locked: boolean) => {
      if (!editor || editor.isDestroyed) return;
      editor.view.dispatch(editor.state.tr.setMeta("lockDragHandle", locked).setMeta("addToHistory", false));
    },
    [editor],
  );

  const closeMenu = useCallback(() => {
    setMenuBid(null);
    setHandleLocked(false);
  }, [setHandleLocked]);

  const onDragStart = useCallback(
    (e: DragEvent) => {
      if (!editor || !e.dataTransfer) return;
      closeMenu();
      const pos = nodePos.current;
      if (!prepareBlockDragPreview(editor, pos, e.dataTransfer)) return;
      queueMicrotask(() => {
        if (editor.isDestroyed || editor.view.dragging || pos < 0) return;
        primeTopLevelBlockDragState(editor.view, pos);
      });
    },
    [closeMenu, editor],
  );

  const onAddBlock = useCallback(() => {
    if (!editor) return;
    closeMenu();
    const pos = nodePos.current;
    if (pos < 0) return;
    const node = editor.state.doc.nodeAt(pos);
    if (!node) return;
    const insertPos = pos + node.nodeSize;
    const cursorPos = insertPos + 1;

    editor.chain().insertContentAt(insertPos, { type: "paragraph" }).setTextSelection(cursorPos).run();
    editor.commands.focus(null, { scrollIntoView: false });

    const items = getSlashMenuItems({
      pageMention: pageMentionRef.current,
      image: {
        insertImage: ({ editor: currentEditor, range }) => {
          insertImageFromSlashMenu(currentEditor, range, { workspaceId, pageId, shareToken });
        },
      },
      emoji: {
        openPicker: ({ editor: currentEditor, range }) => {
          launchEmojiPicker(currentEditor, range);
        },
      },
    }).filter((item) => !item.isAvailable || item.isAvailable({ editor }));
    const range = { from: cursorPos, to: cursorPos };

    let handle: SlashMenuOverlayHandle | null = null;
    handle = mountSlashMenu(editor, {
      items,
      command: (item) => {
        item.command({ editor, range });
        cleanup();
      },
      clientRect: () => {
        const coords = editor.view.coordsAtPos(cursorPos);
        return new DOMRect(coords.left, coords.top, 0, coords.bottom - coords.top);
      },
      onClose: cleanup,
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cleanup();
        return;
      }
      if (handle?.onKeyDown({ event: e, view: editor.view, range })) {
        e.preventDefault();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    editor.on("destroy", cleanup);

    function cleanup() {
      document.removeEventListener("keydown", onKeyDown, true);
      editor.off("destroy", cleanup);
      handle?.destroy();
      handle = null;
    }
  }, [closeMenu, editor, pageId, shareToken, workspaceId]);

  useEffect(() => () => setHandleLocked(false), [setHandleLocked]);

  useEffect(() => {
    if (menuBid === null) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeMenu();
      }
    };

    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as globalThis.Node | null;
      if (target && groupRef.current?.contains(target)) return;
      closeMenu();
    };

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("mousedown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("mousedown", onPointerDown, true);
    };
  }, [closeMenu, menuBid]);

  useEffect(() => {
    if (!editor || menuBid === null) return;
    if (getCurrentTopLevelBlock(editor, menuBid)) return;
    closeMenu();
  }, [closeMenu, editor, menuBid]);

  const toggleMenu = useCallback(() => {
    if (menuBid !== null) {
      closeMenu();
      return;
    }

    const bid = nodeBid.current;
    if (!bid) return;
    setMenuBid(bid);
    setHandleLocked(true);
  }, [closeMenu, menuBid, setHandleLocked]);

  const runBlockAction = useCallback(
    (action: (bid: string) => boolean) => {
      const bid = menuBid;
      if (bid === null) return;
      closeMenu();
      action(bid);
    },
    [closeMenu, menuBid],
  );

  if (!editor || readOnly) return null;

  const canMoveUp = menuBid !== null && canMoveTopLevelBlock(editor.state.doc, menuBid, -1);
  const canMoveDown = menuBid !== null && canMoveTopLevelBlock(editor.state.doc, menuBid, 1);

  return (
    <DragHandleReact
      className="drag-handle"
      editor={editor}
      computePositionConfig={positionConfig}
      onNodeChange={onNodeChange}
      onElementDragStart={onDragStart}
    >
      <div ref={groupRef} className="tiptap-drag-handle-group">
        <button
          type="button"
          className="tiptap-drag-handle tiptap-drag-handle-add"
          draggable={false}
          onClick={onAddBlock}
          onMouseDown={(e) => e.stopPropagation()}
          onDragStart={(e) => e.preventDefault()}
        >
          <Plus size={14} />
        </button>

        <button
          type="button"
          className={`tiptap-drag-handle tiptap-drag-handle-toggle${menuBid !== null ? " is-active" : ""}`}
          aria-label="Block actions"
          aria-expanded={menuBid !== null}
          aria-haspopup="menu"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={toggleMenu}
        >
          <Menu size={14} strokeWidth={2.25} />
        </button>

        {menuBid !== null && (
          <div className="tiptap-block-menu" role="menu" aria-label="Block actions">
            <button
              type="button"
              role="menuitem"
              className="tiptap-block-menu-item"
              disabled={!canMoveUp}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runBlockAction((bid) => moveTopLevelBlock(editor, bid, -1))}
            >
              <span className="tiptap-block-menu-item-icon">
                <ArrowUp size={14} />
              </span>
              <span className="tiptap-block-menu-item-label">Move up</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="tiptap-block-menu-item"
              disabled={!canMoveDown}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runBlockAction((bid) => moveTopLevelBlock(editor, bid, 1))}
            >
              <span className="tiptap-block-menu-item-icon">
                <ArrowDown size={14} />
              </span>
              <span className="tiptap-block-menu-item-label">Move down</span>
            </button>
            <div className="tiptap-block-menu-sep" role="separator" />
            <button
              type="button"
              role="menuitem"
              className="tiptap-block-menu-item is-danger"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runBlockAction((bid) => deleteTopLevelBlock(editor, bid))}
            >
              <span className="tiptap-block-menu-item-icon">
                <Trash2 size={14} />
              </span>
              <span className="tiptap-block-menu-item-label">Delete</span>
            </button>
          </div>
        )}
      </div>
    </DragHandleReact>
  );
}
