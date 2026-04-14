import type { ReactNode } from "react";

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function MobileDrawer({ open, onClose, children }: MobileDrawerProps) {
  return (
    <>
      <div className="hidden md:contents">{children}</div>
      {open && (
        <div className="fixed inset-0 z-[80] flex md:hidden" role="presentation" onClick={onClose}>
          <div className="fixed inset-0 bg-zinc-950/60" aria-hidden="true" />
          <div className="relative z-10 h-full bg-zinc-900" onClick={(e) => e.stopPropagation()}>
            {children}
          </div>
        </div>
      )}
    </>
  );
}
