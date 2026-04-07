import { z } from "zod";

/** Custom messages sent between clients and DocSync via y-partyserver's custom message channel. */

export const PageMetadataRefresh = z.object({
  type: z.literal("page-metadata-refresh"),
});
export type PageMetadataRefresh = z.infer<typeof PageMetadataRefresh>;

export const PageMetadataUpdated = z.object({
  type: z.literal("page-metadata-updated"),
  pageId: z.string(),
  icon: z.string().nullable(),
  cover_url: z.string().nullable(),
});
export type PageMetadataUpdated = z.infer<typeof PageMetadataUpdated>;

export const DocCustomMessage = z.discriminatedUnion("type", [PageMetadataRefresh, PageMetadataUpdated]);
export type DocCustomMessage = z.infer<typeof DocCustomMessage>;

export function parseDocMessage(raw: string): DocCustomMessage | null {
  try {
    const parsed = DocCustomMessage.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
