import { Extension } from "@tiptap/core";
import Details, { DetailsContent, DetailsSummary } from "@tiptap/extension-details";
import { Plugin } from "@tiptap/pm/state";
import {
  applyMoveToDetailsContent,
  DEFAULT_DETAILS_SUMMARY,
  DETAILS_SUMMARY_PLACEHOLDER,
} from "../controllers/details-block";

const DetailsBlock = Details.configure({
  persist: true,
  HTMLAttributes: { class: "tiptap-details" },
  renderToggleButton: ({ element, isOpen, node }) => {
    const summary = node.firstChild?.textContent?.trim() || DEFAULT_DETAILS_SUMMARY;
    element.className = "tiptap-details-toggle";
    element.setAttribute("aria-label", `${isOpen ? "Collapse" : "Expand"} details: ${summary}`);
  },
});

const DetailsBlockSummary = DetailsSummary.configure({
  HTMLAttributes: {
    class: "tiptap-details-summary",
    "data-placeholder": DETAILS_SUMMARY_PLACEHOLDER,
  },
});

const DetailsBlockContent = DetailsContent.configure({
  HTMLAttributes: { class: "tiptap-details-content" },
});

const DetailsBlockKeyboardNavigation = Extension.create({
  name: "detailsBlockKeyboardNavigation",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            keydown: (view, event) => {
              if (event.key !== "Tab" || event.shiftKey) return false;

              const tr = view.state.tr;
              if (!applyMoveToDetailsContent(tr)) return false;

              event.preventDefault();
              view.dispatch(tr.scrollIntoView());
              view.focus();
              return true;
            },
          },
        },
      }),
    ];
  },
});

export const DetailsBlockExtensions = [
  DetailsBlock,
  DetailsBlockSummary,
  DetailsBlockContent,
  DetailsBlockKeyboardNavigation,
] as const;
