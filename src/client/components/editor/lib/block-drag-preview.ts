import type { Editor } from "@tiptap/react";
import { clearDraggedBlockPreview, setDraggedBlockPreview } from "../extensions/block-drag-drop";

let transparentImg: HTMLCanvasElement | null = null;

function getTransparentImg() {
  if (!transparentImg) {
    transparentImg = document.createElement("canvas");
    transparentImg.width = 1;
    transparentImg.height = 1;
  }

  return transparentImg;
}

export function prepareBlockDragPreview(editor: Editor, pos: number, dataTransfer: DataTransfer): boolean {
  const dom = editor.view.nodeDOM(pos);
  const node = editor.state.doc.nodeAt(pos);
  const sourceBid = node && typeof node.attrs.bid === "string" ? node.attrs.bid : null;
  if (!(dom instanceof HTMLElement) || !node || !sourceBid) return false;

  const transparent = getTransparentImg();
  const originalSetDragImage = dataTransfer.setDragImage.bind(dataTransfer);
  originalSetDragImage(transparent, 0, 0);
  dataTransfer.setDragImage = () => originalSetDragImage(transparent, 0, 0);

  const cleanup = () => {
    clearDraggedBlockPreview(editor.view);
    document.removeEventListener("dragend", cleanup);
    document.removeEventListener("drop", cleanup);
  };

  setDraggedBlockPreview(editor.view, dom, sourceBid, pos, pos + node.nodeSize);
  document.addEventListener("dragend", cleanup);
  document.addEventListener("drop", cleanup);
  return true;
}
