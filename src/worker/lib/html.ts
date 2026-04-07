function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Sanitize FTS5 snippet() output, preserving <mark> delimiters. */
export function sanitizeSnippet(raw: string): string {
  return raw
    .split(/(<mark>|<\/mark>)/g)
    .map((part) => (part === "<mark>" || part === "</mark>" ? part : escapeHtml(part)))
    .join("");
}
