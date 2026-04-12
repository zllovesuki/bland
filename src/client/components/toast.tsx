import { useSyncExternalStore } from "react";

type ToastVariant = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
  exiting?: boolean;
}

let nextId = 0;
let toasts: Toast[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function add(message: string, variant: ToastVariant) {
  const id = ++nextId;
  toasts = [{ id, message, variant }, ...toasts].slice(0, 3);
  emit();
  setTimeout(() => {
    toasts = toasts.map((t) => (t.id === id ? { ...t, exiting: true } : t));
    emit();
  }, 3800);
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, 4000);
}

export const toast = {
  success: (message: string) => add(message, "success"),
  error: (message: string) => add(message, "error"),
  info: (message: string) => add(message, "info"),
};

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
  error: "border-red-500/20 bg-red-500/10 text-red-400",
  info: "border-accent-500/20 bg-accent-500/10 text-accent-400",
};

export function ToastContainer() {
  const current = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => toasts,
  );

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2" role="status" aria-live="polite">
      {current.map((t) => (
        <div
          key={t.id}
          aria-live={t.variant === "error" ? "assertive" : undefined}
          className={`${t.exiting ? "translate-y-2 opacity-0" : "animate-slide-up"} rounded-lg border px-4 py-2.5 text-sm shadow-lg transition-[opacity,transform] duration-200 ${VARIANT_CLASSES[t.variant]}`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
