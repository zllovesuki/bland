import { useState, useEffect, useRef, useCallback, useContext } from "react";
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { NodeSelection } from "@tiptap/pm/state";
import { useFloating, offset, shift, autoUpdate, FloatingPortal } from "@floating-ui/react";
import { Replace, Trash2, TextCursorInput, AlignLeft, AlignCenter, AlignRight } from "lucide-react";
import { EditorContext } from "../editor-context";
import {
  createImageNodeTarget,
  deleteImageAtTarget,
  triggerFileUploadAtTarget,
  updateImageAttributesAtTarget,
} from "../lib/media-actions";
import "../styles/floating-controls.css";

interface ImageState {
  pos: number;
  src: string;
  alt: string;
  align: string;
}

export function ImageToolbar({ editor }: { editor: Editor }) {
  const { workspaceId, pageId, shareToken, readOnly } = useContext(EditorContext);
  const [editingAlt, setEditingAlt] = useState(false);
  const [altText, setAltText] = useState("");
  const forcedPosRef = useRef<number | null>(null);

  const imageState = useEditorState({
    editor,
    selector: (ctx): ImageState | null => {
      const { selection } = ctx.editor.state;

      if (forcedPosRef.current !== null) {
        const node = ctx.editor.state.doc.nodeAt(forcedPosRef.current);
        if (node?.type.name === "image" && node.attrs.src) {
          return {
            pos: forcedPosRef.current,
            src: node.attrs.src as string,
            alt: (node.attrs.alt as string) ?? "",
            align: (node.attrs.align as string) ?? "left",
          };
        }
        forcedPosRef.current = null;
      }

      if (!(selection instanceof NodeSelection)) return null;
      const node = selection.node;
      if (node.type.name !== "image" || !node.attrs.src) return null;
      return {
        pos: selection.from,
        src: node.attrs.src as string,
        alt: (node.attrs.alt as string) ?? "",
        align: (node.attrs.align as string) ?? "left",
      };
    },
  });

  const open = imageState !== null;

  const { floatingStyles, refs } = useFloating({
    open,
    placement: "top-end",
    middleware: [offset({ mainAxis: -50, crossAxis: -8 }), shift({ padding: 10 })],
    whileElementsMounted: autoUpdate,
  });

  useEffect(() => {
    if (!imageState) {
      setEditingAlt(false);
      forcedPosRef.current = null;
      return;
    }
    const dom = editor.view.nodeDOM(imageState.pos);
    if (dom instanceof HTMLElement) {
      const container = dom.querySelector(".tiptap-image-container") ?? dom;
      refs.setReference(container);
    }
  }, [imageState?.pos, editor, refs]);

  useEffect(() => {
    if (!imageState) setEditingAlt(false);
  }, [imageState]);

  const updateImageAttr = useCallback(
    (attrs: Record<string, unknown>) => {
      if (!imageState) return;
      updateImageAttributesAtTarget(editor, createImageNodeTarget(editor, imageState.pos), attrs);
    },
    [editor, imageState],
  );

  const deleteImage = useCallback(() => {
    if (!imageState) return;
    deleteImageAtTarget(editor, createImageNodeTarget(editor, imageState.pos));
  }, [editor, imageState]);

  const handleAltEdit = () => {
    if (!imageState) return;
    forcedPosRef.current = imageState.pos;
    setAltText(imageState.alt);
    setEditingAlt(true);
  };

  const handleAltSave = () => {
    updateImageAttr({ alt: altText || null });
    forcedPosRef.current = null;
    setEditingAlt(false);
  };

  const handleAltCancel = () => {
    forcedPosRef.current = null;
    setEditingAlt(false);
  };

  const uploadCtx = { workspaceId, pageId, shareToken };

  if (readOnly || !open) return null;

  return (
    <FloatingPortal>
      <div
        ref={refs.setFloating}
        style={{ ...floatingStyles, zIndex: 50 }}
        className="tiptap-toolbar tiptap-image-toolbar"
        onMouseDownCapture={(e) => {
          if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
        }}
      >
        {editingAlt ? (
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={altText}
              onChange={(e) => setAltText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAltSave();
                if (e.key === "Escape") handleAltCancel();
              }}
              placeholder="Alt text..."
              className="tiptap-link-input"
              autoFocus
            />
            <button
              type="button"
              title="Save"
              onMouseDown={(e) => {
                e.preventDefault();
                handleAltSave();
              }}
            >
              <TextCursorInput size={16} />
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              title="Replace image"
              onMouseDown={(e) => {
                e.preventDefault();
                if (!imageState) return;
                triggerFileUploadAtTarget(editor, uploadCtx, createImageNodeTarget(editor, imageState.pos));
              }}
            >
              <Replace size={16} />
            </button>
            <button
              type="button"
              title="Alt text"
              onMouseDown={(e) => {
                e.preventDefault();
                handleAltEdit();
              }}
            >
              <TextCursorInput size={16} />
            </button>
            <button
              type="button"
              title="Delete image"
              className="text-red-400"
              onMouseDown={(e) => {
                e.preventDefault();
                deleteImage();
              }}
            >
              <Trash2 size={16} />
            </button>
            <div className="tiptap-toolbar-sep" />
            {(["left", "center", "right"] as const).map((a) => {
              const Icon = a === "left" ? AlignLeft : a === "center" ? AlignCenter : AlignRight;
              return (
                <button
                  key={a}
                  type="button"
                  title={`Align ${a}`}
                  className={imageState.align === a ? "is-active" : undefined}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    updateImageAttr({ align: a });
                  }}
                >
                  <Icon size={16} />
                </button>
              );
            })}
          </>
        )}
      </div>
    </FloatingPortal>
  );
}
