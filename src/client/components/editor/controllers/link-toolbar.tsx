import { useEffect, useMemo, useState } from "react";
import type { FC } from "react";
import { Range } from "@tiptap/core";
import { safePolygon, type Placement } from "@floating-ui/react";
import { LinkToolbarExtension } from "@blocknote/core/extensions";
import {
  useBlockNoteEditor,
  useExtension,
  GenericPopover,
  type GenericPopoverReference,
  type FloatingUIOptions,
  LinkToolbar,
  type LinkToolbarProps,
} from "@blocknote/react";
import { freezePlacementOnOpen, choosePlacement, POPOVER_MIDDLEWARE } from "./placement";

export function LinkToolbarController(props: {
  linkToolbar?: FC<LinkToolbarProps>;
  floatingUIOptions?: FloatingUIOptions;
}) {
  const editor = useBlockNoteEditor<any, any, any>();
  const [toolbarOpen, setToolbarOpen] = useState(false);
  const [toolbarPositionFrozen, setToolbarPositionFrozen] = useState(false);
  const [placement, setPlacement] = useState<Placement>("top-start");
  const linkToolbar = useExtension(LinkToolbarExtension);

  const [link, setLink] = useState<
    | {
        cursorType: "text" | "mouse";
        url: string;
        text: string;
        range: Range;
        element: HTMLAnchorElement;
      }
    | undefined
  >(undefined);

  useEffect(() => {
    const textCursorCallback = () => {
      const textCursorLink = linkToolbar.getLinkAtSelection();
      if (!textCursorLink) {
        setLink(undefined);

        if (!toolbarPositionFrozen) {
          setToolbarOpen(false);
        }

        return;
      }

      setLink({
        cursorType: "text",
        url: textCursorLink.mark.attrs.href as string,
        text: textCursorLink.text,
        range: textCursorLink.range,
        element: linkToolbar.getLinkElementAtPos(textCursorLink.range.from)!,
      });

      if (!toolbarPositionFrozen) {
        setToolbarOpen(true);
      }
    };

    const mouseCursorCallback = (event: MouseEvent) => {
      if (link !== undefined && link.cursorType === "text") {
        return;
      }

      if (!(event.target instanceof HTMLElement)) {
        return;
      }

      const mouseCursorLink = linkToolbar.getLinkAtElement(event.target);
      if (!mouseCursorLink) {
        return;
      }

      setLink({
        cursorType: "mouse",
        url: mouseCursorLink.mark.attrs.href as string,
        text: mouseCursorLink.text,
        range: mouseCursorLink.range,
        element: linkToolbar.getLinkElementAtPos(mouseCursorLink.range.from)!,
      });
    };

    const destroyOnChangeHandler = editor.onChange(textCursorCallback);
    const destroyOnSelectionChangeHandler = editor.onSelectionChange(textCursorCallback);

    const domElement = editor.domElement;
    domElement?.addEventListener("mouseover", mouseCursorCallback);

    return () => {
      destroyOnChangeHandler();
      destroyOnSelectionChangeHandler();
      domElement?.removeEventListener("mouseover", mouseCursorCallback);
    };
  }, [editor, editor.domElement, linkToolbar, link, toolbarPositionFrozen]);

  const referenceRect = link?.element?.getBoundingClientRect();
  freezePlacementOnOpen(toolbarOpen, choosePlacement(referenceRect, "top-start", 72), setPlacement);

  const floatingUIOptions = useMemo<FloatingUIOptions>(
    () => ({
      ...props.floatingUIOptions,
      useFloatingOptions: {
        open: toolbarOpen,
        onOpenChange: (open, _event, reason) => {
          if (toolbarPositionFrozen) {
            return;
          }

          if (link !== undefined && link.cursorType === "text" && reason === "hover") {
            return;
          }

          if (reason === "escape-key") {
            editor.focus();
          }

          setToolbarOpen(open);
        },
        placement,
        middleware: [...POPOVER_MIDDLEWARE],
        ...props.floatingUIOptions?.useFloatingOptions,
      },
      useHoverProps: {
        enabled: link !== undefined && link.cursorType === "mouse",
        delay: {
          open: 250,
          close: 250,
        },
        handleClose: safePolygon(),
        ...props.floatingUIOptions?.useHoverProps,
      },
      focusManagerProps: {
        disabled: true,
        ...props.floatingUIOptions?.focusManagerProps,
      },
      elementProps: {
        style: {
          zIndex: 50,
        },
        ...props.floatingUIOptions?.elementProps,
      },
    }),
    [editor, link, placement, props.floatingUIOptions, toolbarOpen, toolbarPositionFrozen],
  );

  const reference = useMemo<GenericPopoverReference | undefined>(
    () => (link?.element ? { element: link.element } : undefined),
    [link?.element],
  );

  if (!editor.isEditable) {
    return null;
  }

  const Component = props.linkToolbar || LinkToolbar;

  return (
    <GenericPopover reference={reference} {...floatingUIOptions}>
      {link && (
        <Component
          url={link.url}
          text={link.text}
          range={link.range}
          setToolbarOpen={setToolbarOpen}
          setToolbarPositionFrozen={setToolbarPositionFrozen}
        />
      )}
    </GenericPopover>
  );
}
