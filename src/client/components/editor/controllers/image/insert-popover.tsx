import { useEffect, useRef, useState } from "react";
import { FloatingPortal } from "@floating-ui/react";
import type { Editor } from "@tiptap/core";
import { Upload } from "lucide-react";
import { toast } from "@/client/components/toast-store";
import { preserveEditorSelectionOnMouseDown, useEditorRectPopover } from "../menu/popover";
import {
  IMAGE_TARGET_MISSING_MESSAGE,
  getImageTargetDom,
  replaceImageSourceAtTarget,
  resolveImageTargetPos,
  triggerFileUploadAtTarget,
  type ImageNodeTarget,
  type UploadContext,
} from "../../lib/media-actions";
import { validateImageUrl } from "./validate-image-url";
import "../../styles/floating-controls.css";

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

      if (targetDom) {
        const anchor = targetDom.querySelector<HTMLElement>(".tiptap-image-container, .tiptap-image-placeholder");
        return (anchor ?? targetDom).getBoundingClientRect();
      }

      try {
        const coords = editor.view.coordsAtPos(resolveImageTargetPos(editor, target) ?? target.pos);
        return new DOMRect(coords.left, coords.top, 0, coords.bottom - coords.top);
      } catch {
        return null;
      }
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
