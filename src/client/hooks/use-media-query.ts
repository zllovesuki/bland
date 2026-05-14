import { useCallback, useSyncExternalStore } from "react";

function getMatches(query: string) {
  return typeof window !== "undefined" && window.matchMedia(query).matches;
}

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (callback: () => void) => {
      if (typeof window === "undefined") return () => {};

      const mediaQuery = window.matchMedia(query);
      const handleChange = () => callback();

      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => getMatches(query), [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
