import { describe, expect, it } from "vitest";

import { parseDocMessage } from "@/shared/doc-messages";

describe("shared doc messages", () => {
  it("parses page metadata refresh messages", () => {
    expect(parseDocMessage(JSON.stringify({ type: "page-metadata-refresh" }))).toEqual({
      type: "page-metadata-refresh",
    });
  });

  it("parses page metadata updated messages", () => {
    expect(
      parseDocMessage(
        JSON.stringify({
          type: "page-metadata-updated",
          pageId: "page-1",
          icon: "📄",
          cover_url: "/uploads/cover-1",
        }),
      ),
    ).toEqual({
      type: "page-metadata-updated",
      pageId: "page-1",
      icon: "📄",
      cover_url: "/uploads/cover-1",
    });
  });

  it("rejects invalid message payloads", () => {
    expect(parseDocMessage(JSON.stringify({ type: "page-metadata-updated", pageId: "page-1", icon: 123 }))).toBeNull();
    expect(parseDocMessage(JSON.stringify({ type: "unknown" }))).toBeNull();
    expect(parseDocMessage("{")).toBeNull();
  });
});
