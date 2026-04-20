// Known-benign window errors that should be suppressed before they reach the
// client error reporter. Keep this list short and well-justified — every new
// entry is a place where we're choosing not to see a real regression.

// Fired when a ResizeObserver callback schedules another layout pass the
// browser couldn't deliver in the same frame. It's a spec-level notice, not a
// fault, and floating-ui's autoUpdate (used by our popovers) triggers it on
// mount. See https://github.com/floating-ui/floating-ui/issues/1740.
const RESIZE_OBSERVER_BENIGN = /ResizeObserver loop (completed with undelivered notifications|limit exceeded)/;

export function isBenignBrowserError(event: ErrorEvent): boolean {
  if (typeof event.message === "string" && RESIZE_OBSERVER_BENIGN.test(event.message)) return true;
  const err = event.error;
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string") {
    return RESIZE_OBSERVER_BENIGN.test(err.message);
  }
  return false;
}
