import { useState, useCallback, useRef, useEffect } from "react";

export function useCopyFeedback<T = string>(timeout = 2000) {
  const [copiedId, setCopiedId] = useState<T | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

  const copy = useCallback(
    (id: T, text: string) => {
      navigator.clipboard.writeText(text);
      clearTimeout(timerRef.current);
      setCopiedId(id);
      timerRef.current = setTimeout(() => setCopiedId(null), timeout);
    },
    [timeout],
  );

  return { copiedId, copy };
}
