import { createContext, use } from "react";

export interface MobileDrawerState {
  open: boolean;
  toggle: () => void;
  close: () => void;
}

export const MobileDrawerContext = createContext<MobileDrawerState>({
  open: false,
  toggle: () => {},
  close: () => {},
});

export function useMobileDrawer(): MobileDrawerState {
  return use(MobileDrawerContext);
}
