export type ToastVariant = "success" | "error" | "info";

export interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
  exiting?: boolean;
}

let nextId = 0;
let toasts: Toast[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function add(message: string, variant: ToastVariant) {
  const id = ++nextId;
  toasts = [{ id, message, variant }, ...toasts].slice(0, 3);
  emit();
  setTimeout(() => {
    toasts = toasts.map((toast) => (toast.id === id ? { ...toast, exiting: true } : toast));
    emit();
  }, 3800);
  setTimeout(() => {
    toasts = toasts.filter((toast) => toast.id !== id);
    emit();
  }, 4000);
}

export function subscribeToast(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getToastSnapshot() {
  return toasts;
}

export const toast = {
  success: (message: string) => add(message, "success"),
  error: (message: string) => add(message, "error"),
  info: (message: string) => add(message, "info"),
};
