import { textblockTypeInputRule } from "@tiptap/core";
import { Plugin, TextSelection } from "@tiptap/pm/state";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { SharedCodeBlock } from "@/shared/editor/schema";
import { resolveLanguage } from "@/shared/editor/schema/code-block";
import { resolveCodeBlockLineRange } from "./selection";
import { CodeBlockView } from "./view";
import { createLazyHighlightPlugin } from "./lazy-highlight";

function createCodeBlockTripleClickPlugin(codeBlockName: string) {
  return new Plugin({
    props: {
      handleTripleClick(view, pos, event) {
        if (event.button !== 0) return false;

        const $pos = view.state.doc.resolve(pos);
        if ($pos.parent.type.name !== codeBlockName) return false;

        const range = resolveCodeBlockLineRange($pos.parent.textContent, $pos.parentOffset);
        const lineSelection = TextSelection.create(view.state.doc, $pos.start() + range.from, $pos.start() + range.to);

        if (!view.state.selection.eq(lineSelection)) {
          view.dispatch(view.state.tr.setSelection(lineSelection).setMeta("pointer", true));
        } else if (!view.hasFocus()) {
          view.focus();
        }

        event.preventDefault();
        return true;
      },
    },
  });
}

export const HighlightedCodeBlock = SharedCodeBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },

  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() ?? []),
      createCodeBlockTripleClickPlugin(this.name),
      createLazyHighlightPlugin(this.name, this.options.defaultLanguage),
    ];
  },

  addInputRules() {
    return [
      textblockTypeInputRule({
        find: /^```([a-z]+)?[\s\n]$/,
        type: this.type,
        getAttributes: (match) => ({ language: resolveLanguage(match[1]) }),
      }),
      textblockTypeInputRule({
        find: /^~~~([a-z]+)?[\s\n]$/,
        type: this.type,
        getAttributes: (match) => ({ language: resolveLanguage(match[1]) }),
      }),
    ];
  },
});
