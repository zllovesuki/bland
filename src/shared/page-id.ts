import { z } from "zod";

// ULID/Crockford base32, 26 characters. Mirrors the encoding produced by
// `ulid()` in `seedPage` and the page-creation routes.
export const PAGE_ID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/i;

export const pageId = z.string().regex(PAGE_ID_PATTERN, "page_id must be a 26-character ULID");
