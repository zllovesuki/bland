import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { Awareness } from "y-protocols/awareness";
import { useAwareness, type AwarenessState } from "@/client/hooks/use-sync";

class FakeAwareness {
  private states = new Map<number, AwarenessState>();
  private listeners = new Set<() => void>();

  getStates() {
    return this.states;
  }

  on(event: "change", listener: () => void) {
    if (event === "change") this.listeners.add(listener);
  }

  off(event: "change", listener: () => void) {
    if (event === "change") this.listeners.delete(listener);
  }

  setState(clientId: number, state: AwarenessState, emit = true) {
    this.states = new Map(this.states).set(clientId, state);
    if (emit) {
      for (const listener of this.listeners) listener();
    }
  }
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useAwareness", () => {
  it("reads the current external state even when a change happened before subscription", async () => {
    const awareness = new FakeAwareness();
    awareness.setState(2, { user: { userId: "user-a" } }, false);

    function Probe({ tick }: { tick: number }) {
      const states = useAwareness(awareness as unknown as Awareness);
      return <output>{`${tick}:${states.get(2)?.user?.userId ?? "missing"}`}</output>;
    }

    const host = document.createElement("div");
    document.body.appendChild(host);
    let root: Root | null = createRoot(host);

    try {
      await act(async () => {
        root!.render(<Probe tick={0} />);
      });

      expect(host.textContent).toBe("0:user-a");

      awareness.setState(2, { user: { userId: "user-b" } }, false);

      await act(async () => {
        root!.render(<Probe tick={1} />);
      });

      expect(host.textContent).toBe("1:user-b");
    } finally {
      await act(async () => {
        root?.unmount();
      });
      root = null;
      host.remove();
    }
  });
});
