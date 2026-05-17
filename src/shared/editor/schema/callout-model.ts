// Runtime-safe callout metadata used by both editor extensions and static presentation.
// Keep this file free of Tiptap imports so public Sites islands can use it.

export const CALLOUT_KINDS = ["info", "tip", "warning"] as const;
export type CalloutKind = (typeof CALLOUT_KINDS)[number];
export const DEFAULT_CALLOUT_KIND: CalloutKind = "info";

const CALLOUT_KIND_SET: ReadonlySet<string> = new Set(CALLOUT_KINDS);

export function isCalloutKind(value: unknown): value is CalloutKind {
  return typeof value === "string" && CALLOUT_KIND_SET.has(value);
}

export function normalizeCalloutKind(value: unknown): CalloutKind {
  return isCalloutKind(value) ? value : DEFAULT_CALLOUT_KIND;
}
