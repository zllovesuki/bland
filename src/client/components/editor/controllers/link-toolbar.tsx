import { useState, useEffect, useRef, useContext } from "react";
import type { Editor } from "@tiptap/react";
import {
  useFloating,
  offset,
  shift,
  flip,
  autoUpdate,
  FloatingPortal,
  safePolygon,
  useHover,
} from "@floating-ui/react";
import { ExternalLink, Pencil, Unlink, Check, X } from "lucide-react";
import { EditorContext } from "../editor-context";
import "../styles/floating-controls.css";
import "../styles/link-toolbar.css";

interface LinkState {
  href: string;
  element: HTMLAnchorElement;
  mode: "cursor" | "hover";
}

export function LinkToolbar({ editor }: { editor: Editor }) {
  const { readOnly } = useContext(EditorContext);
  const [link, setLink] = useState<LinkState | null>(null);
  const [editing, setEditing] = useState(false);
  const [editHref, setEditHref] = useState("");
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const linkRef = useRef(link);
  const hoverHandleClose = useRef(safePolygon({ buffer: 2, requireIntent: false })).current;
  linkRef.current = link;

  const open = link !== null;

  useEffect(() => {
    if (!link) setEditing(false);
  }, [link]);

  const { floatingStyles, refs, context } = useFloating({
    open,
    onOpenChange(nextOpen) {
      if (!nextOpen && linkRef.current?.mode === "hover") {
        setLink(null);
      }
    },
    placement: "top-start",
    middleware: [offset(10), flip({ padding: 10 }), shift({ padding: 10 })],
    whileElementsMounted: autoUpdate,
  });

  useHover(context, {
    enabled: link?.mode === "hover",
    handleClose: hoverHandleClose,
  });

  useEffect(() => {
    if (link?.element) {
      refs.setReference(link.element);
    }
  }, [link?.element, refs]);

  useEffect(() => {
    const handleSelectionUpdate = () => {
      if (!editor.isEditable) return;

      const { from, to } = editor.state.selection;
      if (from !== to) {
        if (linkRef.current?.mode === "cursor") setLink(null);
        return;
      }

      const linkMark = editor.getAttributes("link");
      if (linkMark.href) {
        const domAtPos = editor.view.domAtPos(from);
        const el = domAtPos.node instanceof HTMLElement ? domAtPos.node : domAtPos.node.parentElement;
        const anchor = el?.closest("a");
        if (anchor instanceof HTMLAnchorElement) {
          setLink({ href: linkMark.href, element: anchor, mode: "cursor" });
          return;
        }
      }

      if (linkRef.current?.mode === "cursor") {
        setLink(null);
      }
    };

    editor.on("selectionUpdate", handleSelectionUpdate);
    return () => {
      editor.off("selectionUpdate", handleSelectionUpdate);
    };
  }, [editor]);

  useEffect(() => {
    const dom = editor.view.dom;

    const handleMouseOver = (e: MouseEvent) => {
      if (linkRef.current?.mode === "cursor") return;

      const target = e.target instanceof HTMLElement ? e.target : null;
      const anchor = target?.closest("a");
      if (!(anchor instanceof HTMLAnchorElement)) return;

      if (linkRef.current?.element === anchor && linkRef.current?.mode === "hover") return;

      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = setTimeout(() => {
        const href = anchor.getAttribute("href");
        if (href) {
          setLink({ href, element: anchor, mode: "hover" });
        }
      }, 250);
    };

    const handleMouseOut = (e: MouseEvent) => {
      if (linkRef.current?.mode === "cursor") return;
      if (!hoverTimeoutRef.current) return;

      const related = e.relatedTarget instanceof HTMLElement ? e.relatedTarget : null;
      if (related?.closest("a")) return;

      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    };

    dom.addEventListener("mouseover", handleMouseOver);
    dom.addEventListener("mouseout", handleMouseOut);

    return () => {
      dom.removeEventListener("mouseover", handleMouseOver);
      dom.removeEventListener("mouseout", handleMouseOut);
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, [editor]);

  const selectLink = () => {
    if (!link) return;
    const pos = editor.view.posAtDOM(link.element, 0);
    editor.chain().focus(null, { scrollIntoView: false }).setTextSelection(pos).extendMarkRange("link").run();
  };

  const handleEdit = () => {
    setEditHref(link?.href ?? "");
    setEditing(true);
  };

  const handleSave = () => {
    if (editHref) {
      selectLink();
      editor.chain().focus(null, { scrollIntoView: false }).extendMarkRange("link").setLink({ href: editHref }).run();
    }
    setEditing(false);
    setLink(null);
  };

  const handleRemove = () => {
    selectLink();
    editor.chain().focus(null, { scrollIntoView: false }).unsetLink().run();
    setLink(null);
  };

  const handleOpen = () => {
    if (link?.href) window.open(link.href, "_blank", "noopener");
  };

  if (readOnly || !open) return null;

  return (
    <FloatingPortal>
      <div
        ref={refs.setFloating}
        style={{ ...floatingStyles, zIndex: 50 }}
        className="tiptap-link-toolbar"
        onMouseDownCapture={(e) => {
          if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
        }}
      >
        {editing ? (
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={editHref}
              onChange={(e) => setEditHref(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") setEditing(false);
              }}
              className="tiptap-link-input"
              autoFocus
            />
            <button
              type="button"
              title="Save"
              aria-label="Save"
              onMouseDown={(e) => {
                e.preventDefault();
                handleSave();
              }}
            >
              <Check size={14} />
            </button>
            <button
              type="button"
              title="Cancel"
              aria-label="Cancel"
              onMouseDown={(e) => {
                e.preventDefault();
                setEditing(false);
              }}
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="tiptap-link-url" title={link.href}>
              {link.href}
            </span>
            <button
              type="button"
              title="Edit link"
              aria-label="Edit link"
              onMouseDown={(e) => {
                e.preventDefault();
                handleEdit();
              }}
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              title="Open link"
              aria-label="Open link"
              onMouseDown={(e) => {
                e.preventDefault();
                handleOpen();
              }}
            >
              <ExternalLink size={14} />
            </button>
            <button
              type="button"
              title="Remove link"
              aria-label="Remove link"
              onMouseDown={(e) => {
                e.preventDefault();
                handleRemove();
              }}
            >
              <Unlink size={14} />
            </button>
          </div>
        )}
      </div>
    </FloatingPortal>
  );
}
