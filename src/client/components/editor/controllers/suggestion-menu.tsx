import { useEffect, useMemo, useState } from "react";
import type { Placement } from "@floating-ui/react";
import { BlockSchema, InlineContentSchema, StyleSchema, mergeCSSClasses } from "@blocknote/core";
import {
  SuggestionMenu as SuggestionMenuExtension,
  type SuggestionMenuOptions,
  filterSuggestionItems,
} from "@blocknote/core/extensions";
import {
  useBlockNoteEditor,
  useExtension,
  useExtensionState,
  useComponentsContext,
  useDictionary,
  GenericPopover,
  type GenericPopoverReference,
  type FloatingUIOptions,
  SuggestionMenuWrapper,
  getDefaultReactSlashMenuItems,
  type DefaultReactSuggestionItem,
  type SuggestionMenuProps,
} from "@blocknote/react";
import { freezePlacementOnOpen, choosePlacement, MENU_MIDDLEWARE } from "./placement";

function SlashSuggestionMenu(props: SuggestionMenuProps<DefaultReactSuggestionItem>) {
  const Components = useComponentsContext()!;
  const dict = useDictionary();
  const { items, loadingState, selectedIndex, onItemClick } = props;

  const loader =
    loadingState === "loading-initial" || loadingState === "loading" ? (
      <Components.SuggestionMenu.Loader className="bn-suggestion-menu-loader" />
    ) : null;

  const renderedItems = useMemo(() => {
    let currentGroup: string | undefined;
    const out: React.JSX.Element[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.group !== currentGroup) {
        currentGroup = item.group;
        out.push(
          <Components.SuggestionMenu.Label className="bn-suggestion-menu-label" key={currentGroup}>
            {currentGroup}
          </Components.SuggestionMenu.Label>,
        );
      }
      out.push(
        <Components.SuggestionMenu.Item
          className={mergeCSSClasses(
            "bn-suggestion-menu-item",
            item.size === "small" ? "bn-suggestion-menu-item-small" : "",
          )}
          item={item}
          id={`bn-suggestion-menu-item-${i}`}
          isSelected={i === selectedIndex}
          key={item.title}
          onClick={() => onItemClick?.(item)}
        />,
      );
    }
    return out;
  }, [Components, items, onItemClick, selectedIndex]);

  return (
    <Components.SuggestionMenu.Root id="bn-suggestion-menu" className="bn-suggestion-menu">
      {renderedItems}
      {renderedItems.length === 0 && (loadingState === "loading" || loadingState === "loaded") && (
        <Components.SuggestionMenu.EmptyItem className="bn-suggestion-menu-item">
          {dict.suggestion_menu.no_items_title}
        </Components.SuggestionMenu.EmptyItem>
      )}
      {loader}
    </Components.SuggestionMenu.Root>
  );
}

export function SuggestionMenuController(props: {
  triggerCharacter: string;
  shouldOpen?: SuggestionMenuOptions["shouldOpen"];
  minQueryLength?: number;
}) {
  const editor = useBlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>();
  const { triggerCharacter, shouldOpen, minQueryLength } = props;
  const suggestionMenu = useExtension(SuggestionMenuExtension);

  useEffect(() => {
    suggestionMenu.addSuggestionMenu({ triggerCharacter, shouldOpen });
  }, [suggestionMenu, triggerCharacter, shouldOpen]);

  const state = useExtensionState(SuggestionMenuExtension);
  const referenceRect = state?.referencePos;
  const open = !!(state?.show && state?.triggerCharacter === triggerCharacter);
  const [placement, setPlacement] = useState<Placement>("bottom-start");
  freezePlacementOnOpen(open, choosePlacement(referenceRect, "bottom-start", 240), setPlacement);

  const reference = useExtensionState(SuggestionMenuExtension, {
    selector: (state) =>
      ({
        element: (editor.domElement?.firstChild || undefined) as Element | undefined,
        getBoundingClientRect: () => state?.referencePos || new DOMRect(),
      }) satisfies GenericPopoverReference,
  });

  const floatingUIOptions = useMemo<FloatingUIOptions>(
    () => ({
      useFloatingOptions: {
        open,
        onOpenChange: (nextOpen) => {
          if (!nextOpen) {
            suggestionMenu.closeMenu();
          }
        },
        placement,
        middleware: [...MENU_MIDDLEWARE],
      },
      focusManagerProps: {
        disabled: true,
      },
      elementProps: {
        onMouseDownCapture: (event) => event.preventDefault(),
        style: {
          zIndex: 80,
        },
      },
    }),
    [open, placement, suggestionMenu],
  );

  if (
    !state ||
    (!state.ignoreQueryLength && minQueryLength && (state.query.startsWith(" ") || state.query.length < minQueryLength))
  ) {
    return null;
  }

  return (
    <GenericPopover reference={reference} {...floatingUIOptions}>
      <SuggestionMenuWrapper
        query={state.query}
        closeMenu={suggestionMenu.closeMenu}
        clearQuery={suggestionMenu.clearQuery}
        getItems={async (query: string) => filterSuggestionItems(getDefaultReactSlashMenuItems(editor), query)}
        suggestionMenuComponent={SlashSuggestionMenu}
        onItemClick={(item) => item.onItemClick()}
      />
    </GenericPopover>
  );
}
