import { useEffect, useRef, type ReactNode } from "react";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

export function Dialog({ open, onClose, children, className }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Focus trap: keep Tab within the dialog, re-query on each Tab press
  useEffect(() => {
    if (!open || !panelRef.current) return;
    const panel = panelRef.current;

    const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const getVisible = () =>
      [...panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
        (el) => el.offsetParent !== null && !el.closest(".hidden"),
      );

    // Auto-focus first element
    const initial = getVisible();
    if (initial.length > 0) initial[0].focus();

    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusable = getVisible();
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    panel.addEventListener("keydown", handler);
    return () => panel.removeEventListener("keydown", handler);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center pt-[20vh]"
      role="presentation"
      onClick={onClose}
    >
      <div className="fixed inset-0 bg-zinc-950/50 backdrop-blur-sm" aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        className={`animate-slide-up relative rounded-xl border border-zinc-700 bg-zinc-800 shadow-2xl ${className ?? ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
