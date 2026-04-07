import { textblockTypeInputRule } from "@tiptap/core";
import { CodeBlockLowlight, type CodeBlockLowlightOptions } from "@tiptap/extension-code-block-lowlight";
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
import { CodeBlockView } from "./code-block-view";
import { resolveLanguage } from "./code-block-shared";

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

export const HighlightedCodeBlock = CodeBlockLowlight.extend({
  addOptions() {
    return {
      ...this.parent?.(),
      lowlight,
    } as CodeBlockLowlightOptions;
  },

  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView, { contentDOMElementTag: "span" });
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
