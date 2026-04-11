import { useCallback, useContext, useRef } from "react";
import { DragHandle as DragHandleReact } from "@tiptap/extension-drag-handle-react";
import { offset } from "@floating-ui/dom";
import type { Node } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";
import { MoveVertical, Plus } from "lucide-react";
import { EditorContext } from "../editor-context";
import { clearDraggedBlockPreview, setDraggedBlockPreview } from "../extensions/block-drag-drop";
import { insertImageFromSlashMenu } from "./image-insert-panel";
import { getSlashMenuItems } from "./slash-items";
import { mountSlashMenu, type SlashMenuOverlayHandle } from "./slash-menu-overlay";
import "../styles/drag-handle.css";

const positionConfig = {
  placement: "left-start" as const,
  strategy: "absolute" as const,
  middleware: [offset({ mainAxis: 8 })],
};

let transparentImg: HTMLCanvasElement | null = null;
function getTransparentImg() {
  if (!transparentImg) {
    transparentImg = document.createElement("canvas");
    transparentImg.width = 1;
    transparentImg.height = 1;
  }
  return transparentImg;
}

export function DragHandle({ editor }: { editor: Editor }) {
  const nodePos = useRef(-1);
  const { workspaceId, pageId, shareToken } = useContext(EditorContext);

  const onNodeChange = useCallback(({ pos }: { node: Node | null; editor: Editor; pos: number }) => {
    nodePos.current = pos;
  }, []);

  const onDragStart = useCallback(
    (e: DragEvent) => {
      if (!e.dataTransfer) return;

      const original = e.dataTransfer.setDragImage.bind(e.dataTransfer);
      e.dataTransfer.setDragImage = () => original(getTransparentImg(), 0, 0);

      const dom = editor.view.nodeDOM(nodePos.current);
      const node = editor.state.doc.nodeAt(nodePos.current);
      if (!(dom instanceof HTMLElement) || !node) return;

      const cleanup = () => {
        clearDraggedBlockPreview(editor.view);
        document.removeEventListener("dragend", cleanup);
        document.removeEventListener("drop", cleanup);
      };

      setDraggedBlockPreview(editor.view, dom, nodePos.current, nodePos.current + node.nodeSize);
      document.addEventListener("dragend", cleanup);
      document.addEventListener("drop", cleanup);
    },
    [editor],
  );

  const onAddBlock = useCallback(() => {
    const pos = nodePos.current;
    if (pos < 0) return;
    const node = editor.state.doc.nodeAt(pos);
    if (!node) return;
    const insertPos = pos + node.nodeSize;
    const cursorPos = insertPos + 1;

    editor.chain().insertContentAt(insertPos, { type: "paragraph" }).setTextSelection(cursorPos).run();
    editor.commands.focus(null, { scrollIntoView: false });

    const items = getSlashMenuItems({
      image: {
        insertImage: ({ editor: currentEditor, range }) => {
          insertImageFromSlashMenu(currentEditor, range, { workspaceId, pageId, shareToken });
        },
      },
    });
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
  }, [editor, pageId, shareToken, workspaceId]);

  return (
    <DragHandleReact
      className="drag-handle"
      editor={editor}
      computePositionConfig={positionConfig}
      onNodeChange={onNodeChange}
      onElementDragStart={onDragStart}
    >
      <div className="tiptap-drag-handle-group">
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
        <div className="tiptap-drag-handle">
          <MoveVertical size={14} strokeWidth={2.25} />
        </div>
      </div>
    </DragHandleReact>
  );
}
