const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
export const searchShortcutLabel = isMac ? "⌘K" : "Ctrl+K";
