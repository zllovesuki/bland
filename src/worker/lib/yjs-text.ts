import * as Y from "yjs";
import { YJS_CANVAS_ELEMENTS, YJS_DOCUMENT_STORE, YJS_PAGE_TITLE } from "@/shared/constants";
import { DEFAULT_PAGE_TITLE } from "@/worker/lib/constants";

interface ExcalidrawElementLike {
  type?: string;
  text?: string;
  name?: string;
  isDeleted?: boolean;
}

export function extractPlaintext(ydoc: Y.Doc): { title: string; bodyText: string } {
  const title = ydoc.getText(YJS_PAGE_TITLE).toString();

  const fragment = ydoc.getXmlFragment(YJS_DOCUMENT_STORE);
  const parts: string[] = [];

  function walk(node: unknown) {
    if (!node || typeof node !== "object") return;

    if (node instanceof Y.XmlText) {
      const text = node.toString();
      if (text.trim()) parts.push(text.trim());
      return;
    }

    if (node instanceof Y.XmlElement) {
      const blockType = node.getAttribute("blockType");
      if (blockType === "embed") return;

      for (let i = 0; i < node.length; i++) {
        walk(node.get(i));
      }
      return;
    }

    if (node instanceof Y.XmlFragment) {
      const frag = node;
      for (let i = 0; i < frag.length; i++) {
        walk(frag.get(i));
      }
    }
  }

  walk(fragment);

  return { title: title.trim() || DEFAULT_PAGE_TITLE, bodyText: parts.join(" ") };
}

/**
 * Stub for canvas pages. The real walk over Excalidraw element text lands in
 * commit 2 once the element binding writes live data. For now we index the
 * title only, which matches what brand-new canvases will carry through the
 * search queue.
 */
export function extractCanvasPlaintext(ydoc: Y.Doc): { title: string; bodyText: string } {
  const title = ydoc.getText(YJS_PAGE_TITLE).toString();
  const elements = ydoc.getMap<Y.Map<unknown>>(YJS_CANVAS_ELEMENTS);
  const parts: string[] = [];

  elements.forEach((entry) => {
    const el = entry.get("element") as ExcalidrawElementLike | undefined;
    if (!el || el.isDeleted) return;
    if (el.type === "text" && typeof el.text === "string" && el.text.trim()) {
      parts.push(el.text.trim());
    } else if (el.type === "frame" && typeof el.name === "string" && el.name.trim()) {
      parts.push(el.name.trim());
    }
  });

  return { title: title.trim() || DEFAULT_PAGE_TITLE, bodyText: parts.join(" ") };
}
