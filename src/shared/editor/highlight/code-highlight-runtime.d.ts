// Narrow local declarations for code-highlight-runtime.js. Do not import
// highlight.js or lowlight types here; their declarations reference lib.dom and
// would leak DOM types into the Worker typecheck.
export interface HighlightNode {
  value?: string;
  properties?: { className?: string[] | string };
  children?: HighlightNode[];
}

export interface HighlightResultNode {
  value?: HighlightNode[];
  children?: HighlightNode[];
}

export interface CodeHighlightSegment {
  text: string;
  classes: string[];
}

export interface CodeBlockHighlighter {
  highlight(language: string, value: string): HighlightResultNode;
  highlightAuto(value: string): HighlightResultNode;
  listLanguages(): string[];
  registered?(aliasOrLanguage: string): boolean;
}

export const codeBlockLowlight: CodeBlockHighlighter;
export function isPlainTextCodeLanguage(language: string | null | undefined): boolean;
export function highlightCodeToSegments(language: unknown, code: string): CodeHighlightSegment[];
