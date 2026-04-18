import type { Range } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageMention: {
      insertPageMention: (attrs: { pageId: string; range?: Range }) => ReturnType;
    };
  }
}

export {};
