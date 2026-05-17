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
import markdown from "highlight.js/lib/languages/markdown";
import php from "highlight.js/lib/languages/php";
import plaintext from "highlight.js/lib/languages/plaintext";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import shell from "highlight.js/lib/languages/shell";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import yaml from "highlight.js/lib/languages/yaml";
import { CODE_LANGUAGES, resolveLanguage } from "@/shared/editor/schema/code-block-model";

interface HighlightNode {
  value?: string;
  properties?: { className?: string[] | string };
  children?: HighlightNode[];
}

interface HighlightResultNode {
  value?: HighlightNode[];
  children?: HighlightNode[];
}

export interface CodeHighlightSegment {
  text: string;
  classes: string[];
}

const PLAIN_TEXT_LANGUAGES = new Set(["text", "plaintext", "txt"]);

export const codeBlockLowlight = createLowlight({
  text: plaintext,
  plaintext,
  c,
  csharp,
  cpp,
  dockerfile,
  go,
  hcl: ini,
  java,
  javascript,
  json,
  jsonc: json,
  markdown,
  php,
  python,
  rust,
  shell,
  sql,
  toml: ini,
  typescript,
  yaml,
});

for (const [language, meta] of Object.entries(CODE_LANGUAGES)) {
  const aliases = (meta.aliases ?? []).filter((alias) => alias !== language);
  if (aliases.length > 0) {
    codeBlockLowlight.registerAlias({ [language]: aliases });
  }
}

export function isPlainTextCodeLanguage(language: string | null | undefined): boolean {
  return language ? PLAIN_TEXT_LANGUAGES.has(language.trim().toLowerCase()) : false;
}

export function highlightCodeToSegments(language: unknown, code: string): CodeHighlightSegment[] {
  const normalizedLanguage = resolveLanguage(typeof language === "string" ? language : null);
  if (isPlainTextCodeLanguage(normalizedLanguage)) {
    return plainCodeSegments(code);
  }

  try {
    const result = codeBlockLowlight.highlight(normalizedLanguage, code) as HighlightResultNode;
    const segments = flattenHighlightNodes(getHighlightNodes(result));
    return segments.length > 0 ? segments : plainCodeSegments(code);
  } catch {
    return plainCodeSegments(code);
  }
}

function plainCodeSegments(code: string): CodeHighlightSegment[] {
  return [{ text: code, classes: [] }];
}

function getHighlightNodes(result: HighlightResultNode): HighlightNode[] {
  return result.value ?? result.children ?? [];
}

function flattenHighlightNodes(nodes: HighlightNode[], inheritedClasses: string[] = []): CodeHighlightSegment[] {
  return nodes.flatMap((node) => {
    const classes = [...inheritedClasses, ...readClassNames(node.properties?.className)];
    if (Array.isArray(node.children) && node.children.length > 0) {
      return flattenHighlightNodes(node.children, classes);
    }
    return node.value ? [{ text: node.value, classes }] : [];
  });
}

function readClassNames(className: string[] | string | undefined): string[] {
  if (Array.isArray(className)) return className;
  return className ? [className] : [];
}
