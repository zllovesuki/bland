import { findChildren } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

interface HighlightNode {
  value?: string;
  properties?: { className?: string[] };
  children?: HighlightNode[];
}

interface HighlightResultNode {
  value?: HighlightNode[];
  children?: HighlightNode[];
}

interface CodeBlockHighlighter {
  highlight(language: string, value: string): HighlightResultNode;
  highlightAuto(value: string): HighlightResultNode;
  listLanguages(): string[];
  registered?(aliasOrLanguage: string): boolean;
}

interface LazyHighlightMeta {
  refresh?: boolean;
}

const lazyHighlightPluginKey = new PluginKey<DecorationSet>("lazyCodeBlockHighlight");
const PLAIN_TEXT_LANGUAGES = new Set(["text", "plaintext", "txt"]);
let highlightRuntime: CodeBlockHighlighter | null = null;
let highlightRuntimePromise: Promise<CodeBlockHighlighter> | null = null;

function parseNodes(nodes: HighlightNode[], className: string[] = []): Array<{ text: string; classes: string[] }> {
  return nodes.flatMap((node) => {
    const classes = [...className, ...(node.properties?.className ?? [])];
    if (Array.isArray(node.children) && node.children.length > 0) {
      return parseNodes(node.children, classes);
    }
    return node.value ? [{ text: node.value, classes }] : [];
  });
}

function getHighlightNodes(result: HighlightResultNode): HighlightNode[] {
  return result.value ?? result.children ?? [];
}

function isPlainTextLanguage(language: string | null | undefined): boolean {
  return language ? PLAIN_TEXT_LANGUAGES.has(language.trim().toLowerCase()) : false;
}

function getCodeBlockLanguage(
  language: string | null | undefined,
  defaultLanguage: string | null | undefined,
): string | null | undefined {
  if (language && language.trim() !== "") {
    return language.trim();
  }

  return defaultLanguage?.trim() || undefined;
}

function shouldLoadHighlightRuntime(
  doc: EditorState["doc"],
  name: string,
  defaultLanguage: string | null | undefined,
): boolean {
  return findChildren(doc, (node) => node.type.name === name).some(({ node }) => {
    const language = getCodeBlockLanguage(
      typeof node.attrs.language === "string" ? node.attrs.language : null,
      defaultLanguage,
    );
    return language == null || !isPlainTextLanguage(language);
  });
}

export function getCodeBlockSnapshot(doc: PMNode, name: string, defaultLanguage: string | null | undefined): string[] {
  return findChildren(doc, (node) => node.type.name === name).map(({ node }) => {
    const language = getCodeBlockLanguage(
      typeof node.attrs.language === "string" ? node.attrs.language : null,
      defaultLanguage,
    );
    return `${language ?? ""}\u0000${node.textContent}`;
  });
}

export function codeBlockSnapshotChanged(
  oldDoc: PMNode,
  newDoc: PMNode,
  name: string,
  defaultLanguage: string | null | undefined,
): boolean {
  const oldSnapshot = getCodeBlockSnapshot(oldDoc, name, defaultLanguage);
  const newSnapshot = getCodeBlockSnapshot(newDoc, name, defaultLanguage);

  if (oldSnapshot.length !== newSnapshot.length) {
    return true;
  }

  return oldSnapshot.some((entry, index) => entry !== newSnapshot[index]);
}

function transactionTouchesCodeBlockRanges(transaction: Transaction, doc: PMNode, name: string): boolean {
  const codeBlocks = findChildren(doc, (node) => node.type.name === name);

  return transaction.steps.some((step) => {
    const rangedStep = step as { from?: number; to?: number };
    if (typeof rangedStep.from !== "number" || typeof rangedStep.to !== "number") {
      return false;
    }

    return codeBlocks.some(
      (block) => block.pos >= rangedStep.from! && block.pos + block.node.nodeSize <= rangedStep.to!,
    );
  });
}

function getDecorations(opts: {
  doc: EditorState["doc"];
  name: string;
  lowlight: CodeBlockHighlighter;
  defaultLanguage: string | null | undefined;
}): DecorationSet {
  const decorations: Decoration[] = [];

  findChildren(opts.doc, (node) => node.type.name === opts.name).forEach((block) => {
    let from = block.pos + 1;
    const language = getCodeBlockLanguage(
      typeof block.node.attrs.language === "string" ? block.node.attrs.language : null,
      opts.defaultLanguage,
    );
    const highlightNodes =
      language && !isPlainTextLanguage(language)
        ? (() => {
            const languages = opts.lowlight.listLanguages();
            if (languages.includes(language) || opts.lowlight.registered?.(language)) {
              return getHighlightNodes(opts.lowlight.highlight(language, block.node.textContent));
            }
            return getHighlightNodes(opts.lowlight.highlightAuto(block.node.textContent));
          })()
        : [];

    parseNodes(highlightNodes).forEach((node) => {
      const to = from + node.text.length;
      if (node.classes.length > 0) {
        decorations.push(Decoration.inline(from, to, { class: node.classes.join(" ") }));
      }
      from = to;
    });
  });

  return DecorationSet.create(opts.doc, decorations);
}

function shouldRefreshDecorations(
  transaction: Transaction,
  oldState: EditorState,
  newState: EditorState,
  name: string,
  defaultLanguage: string | null | undefined,
): boolean {
  return (
    transaction.docChanged &&
    (codeBlockSnapshotChanged(oldState.doc, newState.doc, name, defaultLanguage) ||
      transactionTouchesCodeBlockRanges(transaction, oldState.doc, name))
  );
}

function loadHighlightRuntime(): Promise<CodeBlockHighlighter> {
  if (highlightRuntime) {
    return Promise.resolve(highlightRuntime);
  }

  if (!highlightRuntimePromise) {
    highlightRuntimePromise = import("./highlight-runtime").then((mod) => {
      highlightRuntime = mod.codeBlockLowlight as unknown as CodeBlockHighlighter;
      return highlightRuntime;
    });
  }

  return highlightRuntimePromise!;
}

export function createLazyHighlightPlugin(name: string, defaultLanguage: string | null | undefined) {
  return new Plugin<DecorationSet>({
    key: lazyHighlightPluginKey,
    state: {
      init: (_, state) => {
        return highlightRuntime
          ? getDecorations({ doc: state.doc, name, lowlight: highlightRuntime, defaultLanguage })
          : DecorationSet.empty;
      },
      apply: (transaction, decorationSet, oldState, newState) => {
        const meta = transaction.getMeta(lazyHighlightPluginKey) as LazyHighlightMeta | undefined;
        if (meta?.refresh) {
          return highlightRuntime
            ? getDecorations({ doc: newState.doc, name, lowlight: highlightRuntime, defaultLanguage })
            : DecorationSet.empty;
        }

        if (highlightRuntime && shouldRefreshDecorations(transaction, oldState, newState, name, defaultLanguage)) {
          return getDecorations({ doc: transaction.doc, name, lowlight: highlightRuntime, defaultLanguage });
        }

        return decorationSet.map(transaction.mapping, transaction.doc);
      },
    },
    props: {
      decorations(state) {
        return lazyHighlightPluginKey.getState(state) ?? DecorationSet.empty;
      },
    },
    view(view) {
      let active = true;

      const maybeLoad = () => {
        if (highlightRuntime || !shouldLoadHighlightRuntime(view.state.doc, name, defaultLanguage)) {
          return;
        }

        void loadHighlightRuntime()
          .then(() => {
            if (!active) return;
            view.dispatch(
              view.state.tr.setMeta(lazyHighlightPluginKey, { refresh: true }).setMeta("addToHistory", false),
            );
          })
          .catch(() => {
            // Keep code blocks readable even if the highlight runtime fails to load.
          });
      };

      maybeLoad();

      return {
        update(nextView, previousState) {
          view = nextView;
          if (previousState.doc !== nextView.state.doc || previousState.selection !== nextView.state.selection) {
            maybeLoad();
          }
        },
        destroy() {
          active = false;
        },
      };
    },
  });
}
