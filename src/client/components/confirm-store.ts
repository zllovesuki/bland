interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
}

export interface ConfirmState extends ConfirmOptions {
  open: boolean;
}

let resolver: ((value: boolean) => void) | null = null;
let current: ConfirmState | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeConfirm(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getConfirmSnapshot() {
  return current;
}

export function dismissConfirm(value: boolean) {
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
