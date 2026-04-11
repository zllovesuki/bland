import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { isInTable } from "@tiptap/pm/tables";
import { TableOverlayView } from "./overlay-view";
import {
  applyTableHandlesState,
  createTableHandlesPluginState,
  isPrintableKey,
  tableHandlesKey,
  type TableHandlesMeta,
  type TableHandlesPluginState,
} from "./state";

export const TableHandles = Extension.create({
  name: "tableHandles",

  addProseMirrorPlugins() {
    return [
      new Plugin<TableHandlesPluginState>({
        key: tableHandlesKey,
        state: {
          init: createTableHandlesPluginState,
          apply: applyTableHandlesState,
        },
        props: {
          handleKeyDown(view, event) {
            if (!isInTable(view.state)) return false;

            if (event.key === "Escape") {
              const current = tableHandlesKey.getState(view.state);
              if (current?.openMenu || current?.isTyping) {
                const meta: TableHandlesMeta = {};
                if (current.openMenu) meta.openMenu = "close";
                if (current.isTyping) meta.isTyping = false;
                view.dispatch(view.state.tr.setMeta(tableHandlesKey, meta));
              }
              return false;
            }

            if (isPrintableKey(event) && !tableHandlesKey.getState(view.state)?.isTyping) {
              view.dispatch(view.state.tr.setMeta(tableHandlesKey, { isTyping: true }));
            }
            return false;
          },
          handleDOMEvents: {
            mousedown(view, event) {
              if (!tableHandlesKey.getState(view.state)?.isTyping) return false;
              const target = event.target as HTMLElement | null;
              if (!target?.closest("td, th, .tableWrapper")) return false;
              view.dispatch(view.state.tr.setMeta(tableHandlesKey, { isTyping: false }));
              return false;
            },
          },
        },
        view(editorView) {
          return new TableOverlayView(editorView);
        },
      }),
    ];
  },
});
