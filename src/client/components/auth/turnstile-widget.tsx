import { useCallback, useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId: string) => void;
    };
  }
}

interface TurnstileWidgetProps {
  siteKey: string;
  onTokenChange: (token: string | null) => void;
  action?: string;
  resetKey?: number;
}

let scriptLoading = false;
let scriptLoaded = false;
const loadCallbacks: Array<() => void> = [];

function loadTurnstileScript(): Promise<void> {
  if (scriptLoaded) return Promise.resolve();

  return new Promise((resolve) => {
    loadCallbacks.push(resolve);

    if (scriptLoading) return;
    scriptLoading = true;

    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = () => {
      scriptLoaded = true;
      for (const cb of loadCallbacks) cb();
      loadCallbacks.length = 0;
    };
    document.head.appendChild(script);
  });
}

export function TurnstileWidget({ siteKey, onTokenChange, action, resetKey }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenChangeRef = useRef(onTokenChange);
  onTokenChangeRef.current = onTokenChange;

  const renderWidget = useCallback(() => {
    const container = containerRef.current;
    if (!container || !window.turnstile) return;

    if (widgetIdRef.current !== null) {
      window.turnstile.remove(widgetIdRef.current);
      widgetIdRef.current = null;
    }

    widgetIdRef.current = window.turnstile.render(container, {
      sitekey: siteKey,
      appearance: "interaction-only",
      theme: "dark",
      size: "flexible",
      action,
      callback: (token: string) => {
        onTokenChangeRef.current(token);
      },
      "error-callback": () => {
        onTokenChangeRef.current(null);
      },
      "expired-callback": () => {
        onTokenChangeRef.current(null);
      },
    });
  }, [siteKey, action]);

  useEffect(() => {
    loadTurnstileScript().then(renderWidget);

    return () => {
      if (widgetIdRef.current !== null && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [renderWidget]);

  useEffect(() => {
    if (resetKey !== undefined && widgetIdRef.current !== null && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
    }
  }, [resetKey]);

  return <div ref={containerRef} />;
}
