export interface RequestGuard {
  isCurrent(): boolean;
  cancel(): void;
}

export function createRequestGuard(epochRef: { current: number }, activeRef: { current: boolean }): RequestGuard {
  const epoch = ++epochRef.current;
  let cancelled = false;

  return {
    isCurrent() {
      return !cancelled && activeRef.current && epoch === epochRef.current;
    },
    cancel() {
      cancelled = true;
    },
  };
}
