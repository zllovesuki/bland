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

/**
 * Fetch an upload blob and encode it as a data URL. Needed by the canvas
 * surface: Excalidraw won't render images from remote URLs — it requires
 * dataURLs in its `BinaryFiles` map (upstream #9491).
 *
 * Auth: the GET /uploads/:id route authorises via the refresh cookie
 * (same-origin, `credentials: "include"`) or `?share=<token>` query param
 * for share viewers. Do not attach an `Authorization` bearer header — the
 * worker ignores it on this route.
 */
export async function fetchUploadAsDataURL(
  uploadId: string,
  shareToken?: string,
): Promise<{ dataURL: string; mime: string }> {
  const qs = shareToken ? `?share=${encodeURIComponent(shareToken)}` : "";
  const res = await fetch(`/uploads/${uploadId}${qs}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Upload fetch failed: ${res.status}`);
  const mime = res.headers.get("content-type") ?? "application/octet-stream";
  const blob = await res.blob();
  const dataURL = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
  return { dataURL, mime };
}
