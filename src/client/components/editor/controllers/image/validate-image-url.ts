import { IMAGE_MIME_TYPES } from "../../lib/media-actions";

const IMAGE_EMBED_TIMEOUT_MS = 8000;
const ALLOWED_EMBED_MIME_SET = new Set(IMAGE_MIME_TYPES);
const ALLOWED_EMBED_MIME_LABEL = "JPEG, PNG, GIF, WebP, or HEIC";
const REMOTE_IMAGE_VERIFY_ERROR =
  "Could not verify that remote image URL from the browser. The host may block CORS checks; upload the image instead.";

async function fetchImageContentType(url: string, signal: AbortSignal): Promise<string | null> {
  for (const method of ["HEAD", "GET"] as const) {
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        redirect: "follow",
        signal,
      });
    } catch (error) {
      if (method === "HEAD") continue;
      if (error instanceof Error && error.name === "AbortError") throw error;
      throw new Error(REMOTE_IMAGE_VERIFY_ERROR, { cause: error });
    }

    if (!response.ok) {
      if (method === "HEAD") continue;
      throw new Error("Could not fetch image URL");
    }

    const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? null;
    if (contentType) return contentType;
  }

  return null;
}

export function validateImageUrl(url: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return Promise.reject(new Error("Enter a valid image URL"));
  }

  if (parsed.protocol !== "https:") {
    return Promise.reject(new Error("Image URLs must start with https://"));
  }

  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Timed out loading image URL"));
    }, IMAGE_EMBED_TIMEOUT_MS);

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      controller.abort();
      img.onload = null;
      img.onerror = null;
    };

    void (async () => {
      try {
        const contentType = await fetchImageContentType(parsed.toString(), controller.signal);
        if (!contentType) {
          cleanup();
          reject(new Error("Could not verify image content type"));
          return;
        }
        if (!ALLOWED_EMBED_MIME_SET.has(contentType)) {
          cleanup();
          reject(new Error(`Remote image must be ${ALLOWED_EMBED_MIME_LABEL}`));
          return;
        }

        img.src = parsed.toString();
      } catch (error) {
        cleanup();
        reject(
          error instanceof Error && error.name !== "AbortError"
            ? error
            : new Error("Could not verify remote image URL", { cause: error }),
        );
      }
    })();

    img.onload = () => {
      cleanup();
      resolve(parsed.toString());
    };

    img.onerror = () => {
      cleanup();
      reject(new Error("Could not load image from that URL"));
    };
  });
}
