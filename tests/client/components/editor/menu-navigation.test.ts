import { describe, expect, it } from "vitest";
import { getInitialMenuIndex, moveMenuIndex } from "@/client/components/editor/controllers/menu/navigation";

describe("menu navigation helpers", () => {
  it("clamps the initial selection to the available range", () => {
    expect(getInitialMenuIndex(0)).toBe(-1);
    expect(getInitialMenuIndex(3)).toBe(0);
    expect(getInitialMenuIndex(3, 2)).toBe(2);
    expect(getInitialMenuIndex(3, 99)).toBe(2);
  });

  it("wraps forward through the available items", () => {
    expect(moveMenuIndex(-1, 3, 1)).toBe(0);
    expect(moveMenuIndex(0, 3, 1)).toBe(1);
    expect(moveMenuIndex(2, 3, 1)).toBe(0);
  });

  it("wraps backward through the available items", () => {
    expect(moveMenuIndex(-1, 3, -1)).toBe(2);
    expect(moveMenuIndex(2, 3, -1)).toBe(1);
    expect(moveMenuIndex(0, 3, -1)).toBe(2);
  });
});
