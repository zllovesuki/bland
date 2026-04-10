import * as Y from "yjs";
import { YJS_PAGE_TITLE, YJS_DOCUMENT_STORE } from "@/shared/constants";
import { DEFAULT_PAGE_TITLE } from "@/worker/lib/constants";

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
