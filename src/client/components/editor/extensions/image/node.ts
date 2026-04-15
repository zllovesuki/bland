import { Image } from "@tiptap/extension-image";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { ImageNodeView } from "./node-view";

export const ShareAwareImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: { default: "left" },
      width: { default: null },
      pendingInsertId: { default: null },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
  },
});
