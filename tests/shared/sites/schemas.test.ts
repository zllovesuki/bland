import { describe, expect, it } from "vitest";

import {
  parseSitePmJsonEnvelope,
  SitePmJsonEnvelopeSchema,
  type SitePmJsonEnvelope,
} from "@/shared/sites/pm-json-schemas";
import { readIslandProps } from "@/shared/sites/island-schemas";

describe("SitePmJsonEnvelopeSchema", () => {
  const envelope: SitePmJsonEnvelope = {
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "hi" }],
        },
      ],
    },
    metrics: { words: 1, characters: 2 },
    updatedAt: "2026-05-17T12:00:00.000Z",
  };

  it("round-trips a valid envelope", () => {
    expect(parseSitePmJsonEnvelope(JSON.stringify(envelope))).toEqual(envelope);
    expect(SitePmJsonEnvelopeSchema.safeParse(envelope).success).toBe(true);
  });

  it("preserves loose ProseMirror JSON keys", () => {
    const parsed = parseSitePmJsonEnvelope(
      JSON.stringify({
        ...envelope,
        content: {
          type: "doc",
          customRootKey: true,
          content: [
            {
              type: "paragraph",
              attrs: { bid: "abc" },
              customNodeKey: "kept",
              content: [
                {
                  type: "text",
                  text: "hi",
                  marks: [{ type: "bold", customMarkKey: 1 }],
                },
              ],
            },
          ],
        },
      }),
    );

    expect(parsed?.content.customRootKey).toBe(true);
    expect(parsed?.content.content?.[0]?.customNodeKey).toBe("kept");
    expect(parsed?.content.content?.[0]?.content?.[0]?.marks?.[0]?.customMarkKey).toBe(1);
  });

  it("rejects malformed top-level JSON", () => {
    expect(parseSitePmJsonEnvelope("not json")).toBeNull();
  });

  it("rejects missing or wrongly-typed required fields", () => {
    const { ...without } = envelope as Partial<SitePmJsonEnvelope>;
    delete without.content;
    expect(parseSitePmJsonEnvelope(JSON.stringify(without))).toBeNull();

    expect(parseSitePmJsonEnvelope(JSON.stringify({ ...envelope, updatedAt: 42 }))).toBeNull();
    expect(parseSitePmJsonEnvelope(JSON.stringify({ ...envelope, metrics: { words: -1, characters: 0 } }))).toBeNull();
  });

  it("rejects the old SiteRenderArtifact shape so eviction is automatic", () => {
    expect(
      parseSitePmJsonEnvelope(
        JSON.stringify({
          version: 1,
          bodyHtml: "<p>x</p>",
          outline: [],
          metrics: { words: 0, characters: 0 },
        }),
      ),
    ).toBeNull();
  });
});

describe("readIslandProps", () => {
  it("parses sites-image props", () => {
    const props = readIslandProps(
      "sites-image",
      JSON.stringify({ src: "/_assets/1/x", align: "center", naturalWidth: 100, naturalHeight: 50 }),
    );
    expect(props).toEqual({
      src: "/_assets/1/x",
      align: "center",
      naturalWidth: 100,
      naturalHeight: 50,
    });
  });

  it("rejects truncated JSON", () => {
    expect(readIslandProps("sites-image", '{"src":"/_assets/1/x"')).toBeNull();
  });

  it("rejects wrong types", () => {
    expect(readIslandProps("sites-image", JSON.stringify({ src: 0 }))).toBeNull();
    expect(readIslandProps("site-outline-controller", JSON.stringify({ items: "not an array" }))).toBeNull();
  });

  it("parses empty copy-code props", () => {
    expect(readIslandProps("copy-code", "{}")).toEqual({});
  });

  it("parses outline controller items", () => {
    const props = readIslandProps(
      "site-outline-controller",
      JSON.stringify({ items: [{ id: "intro", text: "Intro", level: 1, href: "#intro" }] }),
    );
    expect(props?.items).toHaveLength(1);
  });
});
