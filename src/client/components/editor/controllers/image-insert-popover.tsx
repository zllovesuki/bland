import { useEffect, useRef, useState } from "react";
import { FloatingPortal } from "@floating-ui/react";
import type { Editor } from "@tiptap/core";
import { Upload } from "lucide-react";
import { toast } from "@/client/components/toast";
import { preserveEditorSelectionOnMouseDown, useEditorRectPopover } from "./menu/popover";
import {
  IMAGE_MIME_TYPES,
  IMAGE_TARGET_MISSING_MESSAGE,
  getImageTargetDom,
  replaceImageSourceAtTarget,
  resolveImageTargetPos,
  triggerFileUploadAtTarget,
  type ImageNodeTarget,
  type UploadContext,
} from "../lib/media-actions";
import "../styles/floating-controls.css";

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
    } catch (e) {
      if (method === "HEAD") continue;
      if (e instanceof Error && e.name === "AbortError") throw e;
      throw new Error(REMOTE_IMAGE_VERIFY_ERROR);
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
      } catch (e) {
        cleanup();
        reject(e instanceof Error && e.name !== "AbortError" ? e : new Error("Could not verify remote image URL"));
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

export interface ImageInsertPopoverProps {
  editor: Editor;
  uploadContext: UploadContext;
  target: ImageNodeTarget;
  onClose: () => void;
}

export function ImageInsertPopover({ editor, uploadContext, target, onClose }: ImageInsertPopoverProps) {
  const [embedUrl, setEmbedUrl] = useState("");
  const [validatingEmbed, setValidatingEmbed] = useState(false);
  const mountedRef = useRef(true);
  const { floatingStyles, setFloating } = useEditorRectPopover({
    open: true,
    onClose,
    getAnchorRect: () => {
      const targetDom = getImageTargetDom(editor, target);
      let rect: DOMRect | null = null;

      if (targetDom) {
        const anchor = targetDom.querySelector<HTMLElement>(".tiptap-image-container, .tiptap-image-placeholder");
        rect = (anchor ?? targetDom).getBoundingClientRect();
      } else {
        try {
          const coords = editor.view.coordsAtPos(resolveImageTargetPos(editor, target) ?? target.pos);
          rect = new DOMRect(coords.left, coords.top, 0, coords.bottom - coords.top);
        } catch {
          rect = null;
        }
      }

      return rect;
    },
    contextElement: editor.view.dom,
    deferOutsidePress: true,
  });

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleUpload = () => {
    triggerFileUploadAtTarget(editor, uploadContext, target, onClose);
  };

  const handleEmbed = async () => {
    const url = embedUrl.trim();
    if (!url) {
      onClose();
      return;
    }
    if (/^data:/i.test(url)) {
      toast.error("Data URIs are not supported — upload the image instead.");
      return;
    }

    try {
      setValidatingEmbed(true);
      const validUrl = await validateImageUrl(url);
      if (!replaceImageSourceAtTarget(editor, target, validUrl)) {
        toast.error(IMAGE_TARGET_MISSING_MESSAGE);
      }
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invalid image URL");
    } finally {
      if (mountedRef.current) {
        setValidatingEmbed(false);
      }
    }
  };

  return (
    <FloatingPortal>
      <div
        ref={setFloating}
        className="tiptap-slash-menu"
        style={{ ...floatingStyles, zIndex: 80, minWidth: 240 }}
        onMouseDownCapture={(e) => preserveEditorSelectionOnMouseDown(e)}
      >
        <div className="flex flex-col gap-2 p-2">
          <div className="tiptap-slash-menu-label px-2 py-1">Insert image</div>
          <button
            type="button"
            disabled={validatingEmbed || !uploadContext.workspaceId}
            className="tiptap-slash-menu-item disabled:opacity-40"
            onMouseDown={(e) => {
              e.preventDefault();
              handleUpload();
            }}
          >
            <Upload size={18} className="shrink-0 text-zinc-400" />
            <span>Upload file</span>
          </button>
          <div className="flex items-stretch gap-2">
            <input
              type="text"
              value={embedUrl}
              disabled={validatingEmbed}
              onChange={(e) => setEmbedUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleEmbed();
                if (e.key === "Escape") onClose();
              }}
              placeholder="or, Paste image URL..."
              className="tiptap-link-input min-w-0 flex-1"
              autoFocus
            />
            <button
              type="button"
              disabled={!embedUrl.trim() || validatingEmbed}
              onMouseDown={(e) => {
                e.preventDefault();
                void handleEmbed();
              }}
              className="tiptap-inline-action shrink-0 disabled:opacity-40"
            >
              <span>{validatingEmbed ? "Checking..." : "Embed"}</span>
            </button>
          </div>
        </div>
      </div>
    </FloatingPortal>
  );
}
