import { describe, expect, it } from "vitest";

import { collectMentionPageIds, preWalkSitesJson, type PreWalkMention } from "@/sites/server/json-prewalk";

function mention(pageId: string): { type: "pageMention"; attrs: { pageId: string | null } } {
  return { type: "pageMention", attrs: { pageId } };
}

function image(src: string): { type: "image"; attrs: { src: string } } {
  return { type: "image", attrs: { src } };
}

function mentionsMap(entries: Array<[string, boolean]>): Map<string, PreWalkMention> {
  return new Map(entries.map(([id, reachable]) => [id, { reachable }]));
}

describe("preWalkSitesJson", () => {
  it("strips pageId on unreachable mentions but keeps reachable ones intact", () => {
    const root = {
      type: "doc",
      content: [{ type: "paragraph", content: [mention("reachable-1"), mention("private-1")] }],
    };
    preWalkSitesJson(root, {
      pageId: "host-page",
      mentions: mentionsMap([
        ["reachable-1", true],
        ["private-1", false],
      ]),
    });
    expect(root.content[0].content?.[0].attrs).toEqual({ pageId: "reachable-1" });
    expect(root.content[0].content?.[1].attrs).toEqual({ pageId: null });
  });

  it("treats absent mention entries as restricted", () => {
    const root = {
      type: "doc",
      content: [{ type: "paragraph", content: [mention("unknown-page")] }],
    };
    preWalkSitesJson(root, { pageId: "host", mentions: new Map() });
    expect(root.content[0].content?.[0].attrs).toEqual({ pageId: null });
  });

  it("rewrites /uploads/<id> image src to /_assets/<pageId>/<id>", () => {
    const root = {
      type: "doc",
      content: [image("/uploads/01ABC")],
    };
    preWalkSitesJson(root, { pageId: "host-page", mentions: new Map() });
    expect(root.content[0].attrs?.src).toBe("/_assets/host-page/01ABC");
  });

  it("leaves absolute URLs, empty src, and already-rewritten paths alone", () => {
    const root = {
      type: "doc",
      content: [image("https://cdn.example.com/foo.png"), image("/_assets/other/already"), image("")],
    };
    preWalkSitesJson(root, { pageId: "host", mentions: new Map() });
    expect(root.content[0].attrs?.src).toBe("https://cdn.example.com/foo.png");
    expect(root.content[1].attrs?.src).toBe("/_assets/other/already");
    expect(root.content[2].attrs?.src).toBe("");
  });

  it("collectMentionPageIds dedupes across the document", () => {
    const root = {
      type: "doc",
      content: [
        { type: "paragraph", content: [mention("a"), mention("b"), mention("a")] },
        { type: "paragraph", content: [mention("c")] },
      ],
    };
    expect(collectMentionPageIds(root).sort()).toEqual(["a", "b", "c"]);
  });
});
