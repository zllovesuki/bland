import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { extractCanvasPlaintext } from "@/worker/lib/yjs-text";
import { YJS_CANVAS_ELEMENTS, YJS_PAGE_TITLE } from "@/shared/constants";

function seedElement(ydoc: Y.Doc, id: string, element: Record<string, unknown>): void {
  const map = ydoc.getMap<Y.Map<unknown>>(YJS_CANVAS_ELEMENTS);
  const entry = new Y.Map<unknown>();
  entry.set("element", element);
  map.set(id, entry);
}

describe("extractCanvasPlaintext", () => {
  it("returns the title and empty body for an empty canvas", () => {
    const ydoc = new Y.Doc();
    ydoc.getText(YJS_PAGE_TITLE).insert(0, "Blank canvas");
    expect(extractCanvasPlaintext(ydoc)).toEqual({ title: "Blank canvas", bodyText: "" });
  });

  it("falls back to default title when the page title is blank", () => {
    const ydoc = new Y.Doc();
    expect(extractCanvasPlaintext(ydoc)).toEqual({ title: "Untitled", bodyText: "" });
  });

  it("collects text from text elements and frame names", () => {
    const ydoc = new Y.Doc();
    ydoc.getText(YJS_PAGE_TITLE).insert(0, "Mixed");
    seedElement(ydoc, "el-1", { id: "el-1", type: "text", text: "Hello world" });
    seedElement(ydoc, "el-2", { id: "el-2", type: "frame", name: "System Diagram" });
    seedElement(ydoc, "el-3", { id: "el-3", type: "rectangle" });

    expect(extractCanvasPlaintext(ydoc)).toEqual({
      title: "Mixed",
      bodyText: "Hello world System Diagram",
    });
  });

  it("skips deleted elements (tombstones)", () => {
    const ydoc = new Y.Doc();
    ydoc.getText(YJS_PAGE_TITLE).insert(0, "Tombstones");
    seedElement(ydoc, "el-keep", { id: "el-keep", type: "text", text: "alive" });
    seedElement(ydoc, "el-dead", { id: "el-dead", type: "text", text: "removed", isDeleted: true });

    expect(extractCanvasPlaintext(ydoc)).toEqual({ title: "Tombstones", bodyText: "alive" });
  });

  it("trims and ignores whitespace-only text elements", () => {
    const ydoc = new Y.Doc();
    ydoc.getText(YJS_PAGE_TITLE).insert(0, "Whitespace");
    seedElement(ydoc, "a", { id: "a", type: "text", text: "   " });
    seedElement(ydoc, "b", { id: "b", type: "text", text: "  real content  " });

    expect(extractCanvasPlaintext(ydoc)).toEqual({
      title: "Whitespace",
      bodyText: "real content",
    });
  });
});
