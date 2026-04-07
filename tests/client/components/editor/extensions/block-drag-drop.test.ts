import { describe, expect, it } from "vitest";
import {
  resolveTopLevelDropTarget,
  type TopLevelBlockRect,
} from "@/client/components/editor/extensions/block-drag-drop";

describe("drag-drop boundary resolution", () => {
  const blocks: TopLevelBlockRect[] = [
    { pos: 0, end: 3, top: 100, bottom: 140, left: 40, right: 640 },
    { pos: 3, end: 6, top: 152, bottom: 192, left: 40, right: 640 },
    { pos: 6, end: 9, top: 204, bottom: 244, left: 40, right: 640 },
  ];

  it("drops before the first block when hovering above it", () => {
    expect(resolveTopLevelDropTarget(blocks, 90)).toBe(0);
  });

  it("uses the top half of a block for the boundary before it", () => {
    expect(resolveTopLevelDropTarget(blocks, 110)).toBe(0);
    expect(resolveTopLevelDropTarget(blocks, 160)).toBe(3);
  });

  it("uses the bottom half of a block for the boundary after it", () => {
    expect(resolveTopLevelDropTarget(blocks, 135)).toBe(3);
    expect(resolveTopLevelDropTarget(blocks, 185)).toBe(6);
  });

  it("maps the visual gap before the next block to the boundary before that block", () => {
    expect(resolveTopLevelDropTarget(blocks, 146)).toBe(3);
    expect(resolveTopLevelDropTarget(blocks, 198)).toBe(6);
  });

  it("drops after the last block when hovering below it", () => {
    expect(resolveTopLevelDropTarget(blocks, 260)).toBe(9);
  });
});
