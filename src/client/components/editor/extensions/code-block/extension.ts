import { textblockTypeInputRule } from "@tiptap/core";
import { CodeBlockLowlight, type CodeBlockLowlightOptions } from "@tiptap/extension-code-block-lowlight";
import { Plugin, TextSelection } from "@tiptap/pm/state";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { createLowlight } from "lowlight";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import go from "highlight.js/lib/languages/go";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import php from "highlight.js/lib/languages/php";
import plaintext from "highlight.js/lib/languages/plaintext";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import shell from "highlight.js/lib/languages/shell";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import yaml from "highlight.js/lib/languages/yaml";
import { resolveCodeBlockLineRange } from "./selection";
import { CodeBlockView } from "./view";
import { resolveLanguage } from "./shared";

const lowlight = createLowlight({
  text: plaintext,
  plaintext,
  javascript,
  typescript,
  python,
  java,
  csharp,
  cpp,
  c,
  go,
  sql,
  php,
  rust,
  hcl: ini,
  shell,
  dockerfile,
  yaml,
  json,
  jsonc: json,
  toml: ini,
});

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

export const HighlightedCodeBlock = CodeBlockLowlight.extend({
  addOptions() {
    return {
      ...this.parent?.(),
      lowlight,
    } as CodeBlockLowlightOptions;
  },

  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },

  addProseMirrorPlugins() {
    return [...(this.parent?.() ?? []), createCodeBlockDoubleClickPlugin(this.name)];
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
