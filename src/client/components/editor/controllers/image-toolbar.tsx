import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useContext,
  useMemo,
  useLayoutEffect,
  type CSSProperties,
} from "react";
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { NodeSelection } from "@tiptap/pm/state";
import { autoUpdate as autoUpdateDom, computePosition, offset, shift } from "@floating-ui/dom";
import { FloatingPortal } from "@floating-ui/react";
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

const IMAGE_TOOLBAR_MIN_INSET_WIDTH = 236;
const IMAGE_TOOLBAR_MIN_INSET_HEIGHT = 88;

function canInsetImageToolbar(rect: Pick<DOMRectReadOnly, "width" | "height">, editingAlt: boolean) {
  return !editingAlt && rect.width >= IMAGE_TOOLBAR_MIN_INSET_WIDTH && rect.height >= IMAGE_TOOLBAR_MIN_INSET_HEIGHT;
}

function hiddenToolbarStyles(): CSSProperties {
  return {
    position: "fixed",
    left: 0,
    top: 0,
    visibility: "hidden",
  };
}

export function ImageToolbar({ editor }: { editor: Editor }) {
  const { workspaceId, pageId, shareToken, readOnly } = useContext(EditorContext);
  const [editingAlt, setEditingAlt] = useState(false);
  const [altText, setAltText] = useState("");
  const [referenceEl, setReferenceEl] = useState<HTMLElement | null>(null);
  const [useInsetPosition, setUseInsetPosition] = useState(false);
  const [floatingElement, setFloatingElement] = useState<HTMLDivElement | null>(null);
  const [floatingStyles, setFloatingStyles] = useState<CSSProperties>(() => hiddenToolbarStyles());
  const forcedPosRef = useRef<number | null>(null);
  const lastStylesRef = useRef<CSSProperties>(hiddenToolbarStyles());

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

  const placement = useInsetPosition ? "top-end" : "top";
  const middleware = useMemo(
    () => [offset(useInsetPosition ? { mainAxis: -50, crossAxis: -8 } : 10), shift({ padding: 10 })],
    [useInsetPosition],
  );

  useLayoutEffect(() => {
    if (!imageState) {
      setEditingAlt(false);
      setReferenceEl(null);
      setUseInsetPosition(false);
      forcedPosRef.current = null;
      return;
    }

    const dom = editor.view.nodeDOM(imageState.pos);
    if (dom instanceof HTMLElement) {
      const container = dom.querySelector(".tiptap-image-container") ?? dom;
      setReferenceEl(container instanceof HTMLElement ? container : null);
      return;
    }

    setReferenceEl(null);
  }, [imageState?.pos, editor]);

  useEffect(() => {
    if (!open || !referenceEl || !floatingElement) {
      const nextHiddenStyles = hiddenToolbarStyles();
      if (
        lastStylesRef.current.left !== nextHiddenStyles.left ||
        lastStylesRef.current.top !== nextHiddenStyles.top ||
        lastStylesRef.current.position !== nextHiddenStyles.position ||
        lastStylesRef.current.visibility !== nextHiddenStyles.visibility
      ) {
        lastStylesRef.current = nextHiddenStyles;
        setFloatingStyles(nextHiddenStyles);
      }
      return;
    }

    let active = true;

    // The image toolbar anchors to a selected node view owned outside this
    // component tree. Position it from the resolved DOM node directly instead
    // of useFloating's reference lifecycle; otherwise it can render at (0, 0)
    // even though the image selection is correct.
    const updatePosition = async () => {
      const next = await computePosition(referenceEl, floatingElement, {
        placement,
        strategy: "fixed",
        middleware,
      });

      if (!active) return;

      const nextStyles: CSSProperties = {
        position: "fixed",
        left: next.x,
        top: next.y,
      };

      if (
        lastStylesRef.current.left === nextStyles.left &&
        lastStylesRef.current.top === nextStyles.top &&
        lastStylesRef.current.position === nextStyles.position &&
        lastStylesRef.current.visibility === nextStyles.visibility
      ) {
        return;
      }

      lastStylesRef.current = nextStyles;
      setFloatingStyles(nextStyles);
    };

    const cleanup = autoUpdateDom(referenceEl, floatingElement, updatePosition);
    void updatePosition();

    return () => {
      active = false;
      cleanup();
    };
  }, [floatingElement, middleware, open, placement, referenceEl]);

  useEffect(() => {
    if (!referenceEl) return;

    const updatePlacement = () =>
      setUseInsetPosition(canInsetImageToolbar(referenceEl.getBoundingClientRect(), editingAlt));
    updatePlacement();

    const observer = new ResizeObserver(updatePlacement);
    observer.observe(referenceEl);
    return () => observer.disconnect();
  }, [editingAlt, referenceEl]);

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

  // Resolve the selected image container before rendering the toolbar. If we
  // render with an unresolved anchor, floating-ui falls back to (0, 0) and the
  // toolbar looks like it disappeared even though selection is correct.
  if (readOnly || !open || !referenceEl) return null;

  return (
    <FloatingPortal>
      <div
        ref={setFloatingElement}
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
              aria-label="Save"
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
              aria-label="Replace image"
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
              aria-label="Alt text"
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
              aria-label="Delete image"
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
                  aria-label={`Align ${a}`}
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
