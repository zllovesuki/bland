/** Custom messages sent between clients and DocSync via y-partyserver's custom message channel. */

export type PageMetadataRefresh = {
  type: "page-metadata-refresh";
};

export type PageMetadataUpdated = {
  type: "page-metadata-updated";
  pageId: string;
  icon: string | null;
  cover_url: string | null;
};

export type DocCustomMessage = PageMetadataRefresh | PageMetadataUpdated;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isStringOrNull(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

export function parseDocMessage(raw: string): DocCustomMessage | null {
  try {
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed) || typeof parsed.type !== "string") {
      return null;
    }

    if (parsed.type === "page-metadata-refresh") {
      return { type: "page-metadata-refresh" };
    }

    if (
      parsed.type === "page-metadata-updated" &&
      typeof parsed.pageId === "string" &&
      isStringOrNull(parsed.icon) &&
      isStringOrNull(parsed.cover_url)
    ) {
      return {
        type: "page-metadata-updated",
        pageId: parsed.pageId,
        icon: parsed.icon,
        cover_url: parsed.cover_url,
      };
    }

    return null;
  } catch {
    return null;
  }
}
