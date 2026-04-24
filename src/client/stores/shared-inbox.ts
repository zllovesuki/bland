import { create } from "zustand";
import type { SharedWithMeItem, SharedInboxWorkspaceSummary } from "@/shared/types";

export interface SharedInboxState {
  items: SharedWithMeItem[];
  workspaceSummaries: SharedInboxWorkspaceSummary[];
}

const initialState: SharedInboxState = {
  items: [],
  workspaceSummaries: [],
};

export const useSharedInboxStore = create<SharedInboxState>(() => initialState);

export function applySharedInboxProjection(projection: SharedInboxState): void {
  useSharedInboxStore.setState(projection, true);
}

export function resetSharedInboxProjection(): void {
  useSharedInboxStore.setState(initialState, true);
}

export function selectSharedInboxItems(state: SharedInboxState): SharedWithMeItem[] {
  return state.items;
}

export function selectSharedInboxWorkspaceSummaries(state: SharedInboxState): SharedInboxWorkspaceSummary[] {
  return state.workspaceSummaries;
}

export interface SharedInboxView {
  items: SharedWithMeItem[];
  workspaceSummaries: SharedInboxWorkspaceSummary[];
}

export function selectSharedInboxView(state: SharedInboxState): SharedInboxView {
  return { items: state.items, workspaceSummaries: state.workspaceSummaries };
}

export function useSharedInboxItems(): SharedWithMeItem[] {
  return useSharedInboxStore(selectSharedInboxItems);
}

export function useSharedInboxWorkspaceSummaries(): SharedInboxWorkspaceSummary[] {
  return useSharedInboxStore(selectSharedInboxWorkspaceSummaries);
}
