import { ReactNodeViewRenderer } from "@tiptap/react";
import { SharedCalloutExtension } from "@/shared/editor/schema";
import { CalloutView } from "./view";

export const CalloutExtension = SharedCalloutExtension.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CalloutView);
  },
});
