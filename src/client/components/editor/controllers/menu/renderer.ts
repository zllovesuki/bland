import type { Editor } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";

export interface MountedEditorRenderer<Handle, Props> {
  destroy(): void;
  readonly ref: Handle | null;
  updateProps(next: Partial<Props>): void;
}

export function mountEditorRenderer<Handle, Props extends Record<string, any>>(
  editor: Editor,
  component: React.ComponentType<Props>,
  props: Props,
): MountedEditorRenderer<Handle, Props> {
  let destroyed = false;
  const renderer = new ReactRenderer<Handle, Props>(component, { editor, props });
  document.body.appendChild(renderer.element);

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    editor.off("destroy", destroy);
    renderer.destroy();
    renderer.element.remove();
  }

  editor.on("destroy", destroy);

  return {
    destroy,
    get ref() {
      return destroyed ? null : renderer.ref;
    },
    updateProps(next) {
      if (destroyed) return;
      renderer.updateProps(next);
    },
  };
}
