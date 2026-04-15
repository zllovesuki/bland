import { textblockTypeInputRule } from "@tiptap/core";
import CodeBlock from "@tiptap/extension-code-block";
import { Plugin, TextSelection } from "@tiptap/pm/state";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { resolveCodeBlockLineRange } from "./selection";
import { CodeBlockView } from "./view";
import { createLazyHighlightPlugin } from "./lazy-highlight";
import { resolveLanguage } from "./shared";

function createCodeBlockDoubleClickPlugin(codeBlockName: string) {
  return new Plugin({
    props: {
      handleDoubleClick(view, pos, event) {
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

export const HighlightedCodeBlock = CodeBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },

  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() ?? []),
      createCodeBlockDoubleClickPlugin(this.name),
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
