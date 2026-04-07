import { useSyncExternalStore } from "react";
import { Dialog } from "./ui/dialog";
import { Button } from "./ui/button";

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
}

interface ConfirmState extends ConfirmOptions {
  open: boolean;
}

let resolver: ((value: boolean) => void) | null = null;
let current: ConfirmState | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function dismiss(value: boolean) {
  if (resolver) resolver(value);
  resolver = null;
  current = null;
  emit();
}

export function confirm(opts: ConfirmOptions): Promise<boolean> {
  if (resolver) resolver(false);
  return new Promise<boolean>((resolve) => {
    resolver = resolve;
    current = { ...opts, open: true };
    emit();
  });
}

export function ConfirmContainer() {
  const state = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );

  if (!state) return null;

  const variant = state.variant ?? "default";

  return (
    <Dialog open={state.open} onClose={() => dismiss(false)} className="w-full max-w-sm p-5">
      <h2 className="text-base font-medium text-zinc-200">{state.title}</h2>
      <p className="mt-2 text-sm text-zinc-400">{state.message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => dismiss(false)}>
          {state.cancelLabel ?? "Cancel"}
        </Button>
        <Button variant={variant === "danger" ? "danger" : "secondary"} size="sm" onClick={() => dismiss(true)}>
          {state.confirmLabel ?? "Confirm"}
        </Button>
      </div>
    </Dialog>
  );
}
