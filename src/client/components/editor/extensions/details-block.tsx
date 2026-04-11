import Details, { DetailsContent, DetailsSummary } from "@tiptap/extension-details";
import { DEFAULT_DETAILS_SUMMARY } from "../controllers/details-block";

export const DetailsBlock = Details.configure({
  persist: true,
  HTMLAttributes: { class: "tiptap-details" },
  renderToggleButton: ({ element, isOpen, node }) => {
    const summary = node.firstChild?.textContent?.trim() || DEFAULT_DETAILS_SUMMARY;
    element.className = "tiptap-details-toggle";
    element.setAttribute("aria-label", `${isOpen ? "Collapse" : "Expand"} details: ${summary}`);
  },
});

export const DetailsBlockSummary = DetailsSummary.configure({
  HTMLAttributes: {
    class: "tiptap-details-summary",
    "data-placeholder": DEFAULT_DETAILS_SUMMARY,
  },
});

export const DetailsBlockContent = DetailsContent.configure({
  HTMLAttributes: { class: "tiptap-details-content" },
});

export const DetailsBlockExtensions = [DetailsBlock, DetailsBlockSummary, DetailsBlockContent] as const;
