export const DEFAULT_PAGE_TITLE = "Untitled";
export const YJS_PAGE_TITLE = "page-title";
export const YJS_DOCUMENT_STORE = "document-store";
export const MAX_TREE_DEPTH = 10;
export const MAX_PAGE_MENTION_BATCH = 100;
export const ALLOWED_UPLOAD_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "application/pdf",
] as const;
export const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10MB
export const UPLOAD_MIME_SET = new Set<string>(ALLOWED_UPLOAD_TYPES);
