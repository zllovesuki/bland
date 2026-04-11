// Plain-text copy should match visible line breaks instead of inserting blank lines between blocks.
export const EDITOR_CORE_EXTENSION_OPTIONS = {
  clipboardTextSerializer: {
    blockSeparator: "\n",
  },
} as const;
