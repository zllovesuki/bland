import { mergeAttributes } from "@tiptap/core";
import { Image, type ImageOptions } from "@tiptap/extension-image";
import { ReactNodeViewRenderer } from "@tiptap/react";
import type { EditorRuntimeSnapshot } from "../../editor-runtime-context";
import { resolveShareUrl } from "../../lib/media-actions";
import { ImageNodeView } from "./node-view";

interface ShareAwareImageOptions extends ImageOptions {
  getRuntime: () => EditorRuntimeSnapshot;
}

const EMPTY_RUNTIME: EditorRuntimeSnapshot = {
  workspaceId: undefined,
  pageId: "",
  shareToken: undefined,
};

export const ShareAwareImage = Image.extend<ShareAwareImageOptions>({
  addOptions() {
    const parent = this.parent?.();
    return {
      inline: parent?.inline ?? false,
      allowBase64: parent?.allowBase64 ?? false,
      HTMLAttributes: parent?.HTMLAttributes ?? {},
      resize: parent?.resize ?? false,
      getRuntime: () => EMPTY_RUNTIME,
    };
  },
  addAttributes() {
    return {
      ...this.parent?.(),
      align: { default: "left" },
      width: { default: null },
      naturalWidth: { default: null },
      naturalHeight: { default: null },
      pendingInsertId: { default: null },
    };
  },
  renderHTML({ HTMLAttributes }) {
    const src = typeof HTMLAttributes.src === "string" ? HTMLAttributes.src : "";
    const shareToken = this.options.getRuntime().shareToken;

    return [
      "img",
      mergeAttributes(this.options.HTMLAttributes, {
        ...HTMLAttributes,
        src: resolveShareUrl(src, shareToken),
      }),
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
  },
});
