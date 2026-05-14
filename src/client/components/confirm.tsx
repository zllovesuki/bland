import { useSyncExternalStore } from "react";
import { Dialog } from "./ui/dialog";
import { Button } from "./ui/button";
import { dismissConfirm, getConfirmSnapshot, subscribeConfirm } from "./confirm-store";

export function ConfirmContainer() {
  const state = useSyncExternalStore(subscribeConfirm, getConfirmSnapshot);

  if (!state) return null;

  const variant = state.variant ?? "default";

  return (
    <Dialog open={state.open} onClose={() => dismissConfirm(false)} className="w-full max-w-sm p-5">
      <h2 className="text-base font-medium text-zinc-200">{state.title}</h2>
      <p className="mt-2 text-sm text-zinc-400">{state.message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => dismissConfirm(false)}>
          {state.cancelLabel ?? "Cancel"}
        </Button>
        <Button variant={variant === "danger" ? "danger" : "secondary"} size="sm" onClick={() => dismissConfirm(true)}>
          {state.confirmLabel ?? "Confirm"}
        </Button>
      </div>
    </Dialog>
  );
}
