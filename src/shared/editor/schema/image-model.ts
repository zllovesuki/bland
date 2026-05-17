// Runtime-safe image metadata used by both editor extensions and static presentation.
// Keep this file free of Tiptap imports so public Sites islands can use it.

export type ImageAlign = "left" | "center" | "right";

export function normalizeImageAlign(value: unknown): ImageAlign {
  return value === "center" || value === "right" ? value : "left";
}
