import { createContext, useContext } from "react";
import type { PageMentionContextValue } from "./context";

const EMPTY_SCOPE: PageMentionContextValue = {
  resolver: null,
  navigate: () => {},
};

export const PageMentionScopeContext = createContext<PageMentionContextValue>(EMPTY_SCOPE);

export function usePageMentionScope(): PageMentionContextValue {
  return useContext(PageMentionScopeContext);
}
