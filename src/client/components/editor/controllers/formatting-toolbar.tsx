import { useMemo, useState } from "react";
import type { FC } from "react";
import { posToDOMRect } from "@tiptap/core";
import type { Placement } from "@floating-ui/react";
import { BlockSchema, InlineContentSchema, StyleSchema, blockHasType, defaultProps } from "@blocknote/core";
import { FormattingToolbarExtension } from "@blocknote/core/extensions";
import {
  useBlockNoteEditor,
  useEditorState,
  useExtension,
  useExtensionState,
  PositionPopover,
  type FloatingUIOptions,
  FormattingToolbar,
  type FormattingToolbarProps,
} from "@blocknote/react";
import { freezePlacementOnOpen, choosePlacement, POPOVER_MIDDLEWARE } from "./placement";

const textAlignmentToTopPlacement = (textAlignment: "left" | "center" | "right" | "justify" | undefined): Placement => {
  switch (textAlignment) {
    case "center":
      return "top";
    case "right":
      return "top-end";
    default:
      return "top-start";
  }
};

export function FormattingToolbarController(props: {
  formattingToolbar?: FC<FormattingToolbarProps>;
  floatingUIOptions?: FloatingUIOptions;
}) {
  const editor = useBlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>();
  const formattingToolbar = useExtension(FormattingToolbarExtension, { editor });
  const show = useExtensionState(FormattingToolbarExtension, { editor });

  const position = useEditorState({
    editor,
    selector: ({ editor }) =>
      formattingToolbar.store.state
        ? {
            from: editor.prosemirrorState.selection.from,
            to: editor.prosemirrorState.selection.to,
          }
        : undefined,
  });

  const preferredPlacement = useEditorState({
    editor,
    selector: ({ editor }) => {
      const block = editor.getTextCursorPosition().block;

      if (
        !blockHasType(block, editor, block.type, {
          textAlignment: defaultProps.textAlignment,
        })
      ) {
        return "top-start" as Placement;
      }

      return textAlignmentToTopPlacement(block.props.textAlignment);
    },
  });

  const referenceRect = useMemo(() => {
    const from = position?.from;
    const to = position?.to;
    if (from === undefined || to === undefined) return undefined;
    return posToDOMRect(editor.prosemirrorView, from, to ?? from);
  }, [editor, position?.from, position?.to]);

  const [placement, setPlacement] = useState<Placement>(preferredPlacement);
  freezePlacementOnOpen(show, choosePlacement(referenceRect, preferredPlacement, 96), setPlacement);

  const floatingUIOptions = useMemo<FloatingUIOptions>(
    () => ({
      ...props.floatingUIOptions,
      useFloatingOptions: {
        open: show,
        onOpenChange: (open, _event, reason) => {
          formattingToolbar.store.setState(open);

          if (reason === "escape-key") {
            editor.focus();
          }
        },
        placement,
        middleware: [...POPOVER_MIDDLEWARE],
        ...props.floatingUIOptions?.useFloatingOptions,
      },
      focusManagerProps: {
        disabled: true,
        ...props.floatingUIOptions?.focusManagerProps,
      },
      elementProps: {
        style: {
          zIndex: 40,
        },
        ...props.floatingUIOptions?.elementProps,
      },
    }),
    [editor, formattingToolbar.store, placement, props.floatingUIOptions, show],
  );

  const Component = props.formattingToolbar || FormattingToolbar;

  return (
    <PositionPopover position={position} {...floatingUIOptions}>
      {show && <Component />}
    </PositionPopover>
  );
}
