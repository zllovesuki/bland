export interface CodeBlockLineRange {
  from: number;
  to: number;
}

export function resolveCodeBlockLineRange(text: string, offset: number): CodeBlockLineRange {
  const clampedOffset = Math.max(0, Math.min(offset, text.length));
  const breakBefore = clampedOffset > 0 ? text.lastIndexOf("\n", clampedOffset - 1) : -1;
  const lineStart = breakBefore + 1;
  const nextBreak = text.indexOf("\n", clampedOffset);
  const lineEnd = nextBreak === -1 ? text.length : nextBreak;

  if (lineStart === lineEnd && lineEnd < text.length) {
    return { from: lineStart, to: lineEnd + 1 };
  }

  return { from: lineStart, to: lineEnd };
}
