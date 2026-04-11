import { useState, useEffect, useRef } from "react";
import type { Editor } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import { computePosition, offset, shift, flip } from "@floating-ui/dom";
import { Upload } from "lucide-react";
import { toast } from "@/client/components/toast";
import { IMAGE_MIME_TYPES, triggerFileUpload, type UploadContext } from "../lib/media-actions";
import "../styles/floating-controls.css";
import "../styles/slash-menu.css";

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

function validateImageUrl(url: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return Promise.reject(new Error("Enter a valid image URL"));
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return Promise.reject(new Error("Image URLs must start with http:// or https://"));
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

export function ImageInsertPanel({
  editor,
  uploadContext,
  onClose,
}: {
  editor: Editor;
  uploadContext: UploadContext;
  onClose: () => void;
}) {
  const [embedUrl, setEmbedUrl] = useState("");
  const [validatingEmbed, setValidatingEmbed] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const coords = editor.view.coordsAtPos(editor.state.selection.from);
    const panel = panelRef.current;
    if (!panel) return;
    void computePosition(
      { getBoundingClientRect: () => new DOMRect(coords.left, coords.top, 0, coords.bottom - coords.top) },
      panel,
      { placement: "bottom-start", middleware: [offset(10), shift({ padding: 10 }), flip({ padding: 10 })] },
    ).then(({ x, y }) => {
      panel.style.left = `${x}px`;
      panel.style.top = `${y}px`;
    });
  }, [editor]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [onClose]);

  const handleUpload = () => {
    triggerFileUpload(editor, uploadContext, onClose);
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
      editor.chain().focus(null, { scrollIntoView: false }).setImage({ src: validUrl }).run();
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
    <div
      ref={panelRef}
      className="tiptap-slash-menu"
      style={{ position: "fixed", zIndex: 80, minWidth: 240 }}
      onMouseDownCapture={(e) => {
        if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
      }}
    >
      <div className="flex flex-col gap-2 p-2">
        <div className="tiptap-slash-menu-label px-2 py-1">Insert image</div>
        <button
          type="button"
          disabled={validatingEmbed}
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
  );
}

export function showImageInsertPanel(editor: Editor, uploadContext: UploadContext) {
  let renderer: ReactRenderer<unknown, { editor: Editor; uploadContext: UploadContext; onClose: () => void }> | null =
    null;

  const cleanup = () => {
    editor.off("destroy", cleanup);
    renderer?.destroy();
    renderer?.element.remove();
    renderer = null;
  };

  renderer = new ReactRenderer(ImageInsertPanel, {
    props: { editor, uploadContext, onClose: cleanup },
    editor,
  });
  document.body.appendChild(renderer.element);
  editor.on("destroy", cleanup);
}
