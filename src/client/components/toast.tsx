import { useSyncExternalStore } from "react";
import { getToastSnapshot, subscribeToast, type ToastVariant } from "./toast-store";

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
  error: "border-red-500/20 bg-red-500/10 text-red-400",
  info: "border-accent-500/20 bg-accent-500/10 text-accent-400",
};

export function ToastContainer() {
  const current = useSyncExternalStore(subscribeToast, getToastSnapshot);

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
