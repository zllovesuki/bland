import { describe, expect, it } from "vitest";
import { getPageMentionViewState } from "@/client/components/editor/lib/page-mention-view-state";

describe("page mention view state", () => {
  it("keeps pending mentions non-interactive with no metadata", () => {
    expect(
      getPageMentionViewState({
        status: "pending",
        source: null,
        accessible: false,
        title: "Leaked title",
        icon: "A",
      }),
    ).toEqual({
      kind: "pending",
      interactive: false,
      label: "Pending...",
      ariaLabel: "Pending page mention",
    });
  });

  it("renders restricted mentions without exposing metadata", () => {
    expect(
      getPageMentionViewState({
        status: "resolved",
        source: "server",
        accessible: false,
        title: "Hidden title",
        icon: "A",
      }),
    ).toEqual({
      kind: "restricted",
      interactive: false,
      label: "Restricted",
      ariaLabel: "Restricted page mention",
    });
  });

  it("renders accessible mentions from resolved metadata", () => {
    expect(
      getPageMentionViewState({
        status: "resolved",
        source: "server",
        accessible: true,
        title: "Roadmap",
        icon: "R",
      }),
    ).toEqual({
      kind: "accessible",
      interactive: true,
      label: "Roadmap",
      ariaLabel: "Roadmap",
      icon: "R",
      showFallbackIcon: false,
    });
  });

  it("falls back to Untitled for accessible mentions without a resolved title", () => {
    expect(
      getPageMentionViewState({
        status: "resolved",
        source: "server",
        accessible: true,
        title: null,
        icon: null,
      }),
    ).toEqual({
      kind: "accessible",
      interactive: true,
      label: "Untitled",
      ariaLabel: "Untitled",
      icon: null,
      showFallbackIcon: true,
    });
  });
});
