import { api } from "@/client/lib/api";
import { MAX_UPLOAD_SIZE, UPLOAD_MIME_SET } from "@/shared/constants";
import type { PresignRequest } from "@/shared/types";

export async function uploadFile(
  workspaceId: string,
  file: File,
  pageId?: string,
  shareToken?: string,
): Promise<string> {
  if (!UPLOAD_MIME_SET.has(file.type)) throw new Error("File type not allowed");
  if (file.size > MAX_UPLOAD_SIZE) throw new Error("File too large (max 10MB)");

  const upload = await api.uploads.presign(
    workspaceId,
    {
      filename: file.name,
      content_type: file.type as PresignRequest["content_type"],
      size_bytes: file.size,
      page_id: pageId ?? null,
    },
    shareToken,
  );
  await api.uploads.uploadData(upload.upload_url, file, shareToken);
  return upload.url;
}
