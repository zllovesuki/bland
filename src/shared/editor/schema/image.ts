import { mergeAttributes } from "@tiptap/core";
import { Image, type ImageOptions } from "@tiptap/extension-image";
import { MAX_IMAGE_BRIGHTNESS, normalizeImageBrightness } from "./image-model";
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
      brightness: {
        default: MAX_IMAGE_BRIGHTNESS,
        parseHTML: (element) => normalizeImageBrightness(element.getAttribute("data-brightness")),
        renderHTML: (attrs) => {
          const brightness = normalizeImageBrightness(attrs.brightness);
          return brightness === MAX_IMAGE_BRIGHTNESS
            ? {}
            : { "data-brightness": brightness, style: `filter: brightness(${brightness / 100})` };
        },
      },
    };
  },

  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes)];
  },
});
