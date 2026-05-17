import { mergeAttributes } from "@tiptap/core";
import { Image, type ImageOptions } from "@tiptap/extension-image";
export { normalizeImageAlign, type ImageAlign } from "./image-model";

export const SharedImage = Image.extend<ImageOptions>({
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
    return ["img", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)];
  },
});
