import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { DragHandle as DragHandleReact } from "@tiptap/extension-drag-handle-react";
import { offset } from "@floating-ui/dom";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";
import { ArrowDown, ArrowUp, Menu, Plus, Trash2 } from "lucide-react";
import { EditorContext } from "../editor-context";
import { prepareBlockDragPreview } from "../lib/block-drag-preview";
import { canMoveTopLevelBlock, deleteTopLevelBlock, moveTopLevelBlock } from "../lib/block-actions";
import { canInsertPageMentions } from "../lib/can-insert-page-mentions";
import { launchPageMentionPicker } from "../lib/open-page-mention-picker";
import { launchEmojiPicker } from "./emoji-insert-panel";
import { insertImageFromSlashMenu } from "./image-insert-panel";
import { getSlashMenuItems, type SlashMenuPageMentionConfig } from "./slash-items";
import { mountSlashMenu, type SlashMenuOverlayHandle } from "./slash-menu-overlay";
import "../styles/drag-handle.css";

const positionConfig = {
  placement: "left-start" as const,
  strategy: "absolute" as const,
  middleware: [offset({ mainAxis: 8, crossAxis: 2 })],
};

export function DragHandle({ editor }: { editor: Editor }) {
  const nodePos = useRef(-1);
  const groupRef = useRef<HTMLDivElement>(null);
  const { workspaceId, pageId, shareToken, readOnly } = useContext(EditorContext);
  const [menuPos, setMenuPos] = useState<number | null>(null);
  const pageMentionRef = useRef<SlashMenuPageMentionConfig | null>(null);
  pageMentionRef.current = canInsertPageMentions({ editable: !readOnly, workspaceId, shareToken })
    ? {
        openPicker: ({ editor: currentEditor, range }) => {
          launchPageMentionPicker(currentEditor, { range, currentPageId: pageId });
        },
      }
    : null;

  const onNodeChange = useCallback(({ pos }: { node: PMNode | null; editor: Editor; pos: number }) => {
    nodePos.current = pos;
  }, []);

  const setHandleLocked = useCallback(
    (locked: boolean) => {
      if (editor.isDestroyed) return;
      editor.view.dispatch(editor.state.tr.setMeta("lockDragHandle", locked).setMeta("addToHistory", false));
    },
    [editor],
  );

  const closeMenu = useCallback(() => {
    setMenuPos(null);
    setHandleLocked(false);
  }, [setHandleLocked]);

  const onDragStart = useCallback(
    (e: DragEvent) => {
      if (!e.dataTransfer) return;
      closeMenu();
      prepareBlockDragPreview(editor, nodePos.current, e.dataTransfer);
    },
    [closeMenu, editor],
  );

  const onAddBlock = useCallback(() => {
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

    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || !document.querySelector(".tiptap-slash-menu")?.contains(target)) {
        cleanup();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("mousedown", onMouseDown);
    editor.on("destroy", cleanup);

    function cleanup() {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("mousedown", onMouseDown);
      editor.off("destroy", cleanup);
      handle?.destroy();
      handle = null;
    }
  }, [closeMenu, editor, pageId, shareToken, workspaceId]);

  useEffect(() => () => setHandleLocked(false), [setHandleLocked]);

  useEffect(() => {
    if (menuPos === null) return;

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
  }, [closeMenu, menuPos]);

  const toggleMenu = useCallback(() => {
    if (menuPos !== null) {
      closeMenu();
      return;
    }

    const pos = nodePos.current;
    if (pos < 0) return;
    setMenuPos(pos);
    setHandleLocked(true);
  }, [closeMenu, menuPos, setHandleLocked]);

  const runBlockAction = useCallback(
    (action: (pos: number) => boolean) => {
      const pos = menuPos;
      if (pos === null) return;
      closeMenu();
      action(pos);
    },
    [closeMenu, menuPos],
  );

  const canMoveUp = menuPos !== null && canMoveTopLevelBlock(editor.state.doc, menuPos, -1);
  const canMoveDown = menuPos !== null && canMoveTopLevelBlock(editor.state.doc, menuPos, 1);

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
          className={`tiptap-drag-handle tiptap-drag-handle-toggle${menuPos !== null ? " is-active" : ""}`}
          aria-label="Block actions"
          aria-expanded={menuPos !== null}
          aria-haspopup="menu"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={toggleMenu}
        >
          <Menu size={14} strokeWidth={2.25} />
        </button>

        {menuPos !== null && (
          <div className="tiptap-block-menu" role="menu" aria-label="Block actions">
            <button
              type="button"
              role="menuitem"
              className="tiptap-block-menu-item"
              disabled={!canMoveUp}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runBlockAction((pos) => moveTopLevelBlock(editor, pos, -1))}
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
              onClick={() => runBlockAction((pos) => moveTopLevelBlock(editor, pos, 1))}
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
              onClick={() => runBlockAction((pos) => deleteTopLevelBlock(editor, pos))}
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
