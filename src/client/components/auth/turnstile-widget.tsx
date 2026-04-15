import { useCallback, useEffect, useRef } from "react";
import { reportClientError } from "@/client/lib/report-client-error";
import { getBootstrapCspNonceSnapshot } from "@/client/lib/client-config";

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
  onUnavailable?: () => void;
  action?: string;
  resetKey?: number;
}

let scriptLoaded = false;
let scriptPromise: Promise<void> | null = null;

export function loadTurnstileScript(): Promise<void> {
  if (scriptLoaded || window.turnstile) {
    scriptLoaded = true;
    return Promise.resolve();
  }

  if (scriptPromise) {
    return scriptPromise;
  }

  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    const cspNonce = getBootstrapCspNonceSnapshot();
    if (cspNonce) {
      script.nonce = cspNonce;
    }
    script.onload = () => {
      scriptLoaded = true;
      scriptPromise = null;
      resolve();
    };
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Failed to load the Turnstile script"));
    };
    document.head.appendChild(script);
  });

  return scriptPromise;
}

export function TurnstileWidget({ siteKey, onTokenChange, onUnavailable, action, resetKey }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenChangeRef = useRef(onTokenChange);
  const onUnavailableRef = useRef(onUnavailable);
  onTokenChangeRef.current = onTokenChange;
  onUnavailableRef.current = onUnavailable;

  const handleUnavailable = useCallback(() => {
    onTokenChangeRef.current(null);
    onUnavailableRef.current?.();
  }, []);

  const renderWidget = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    if (!window.turnstile) {
      reportClientError({
        source: "turnstile.missing-api",
        error: new Error("Turnstile API was unavailable after the script loaded"),
        context: {
          action: action ?? null,
        },
      });
      handleUnavailable();
      return;
    }

    if (widgetIdRef.current !== null) {
      window.turnstile.remove(widgetIdRef.current);
      widgetIdRef.current = null;
    }

    try {
      widgetIdRef.current = window.turnstile.render(container, {
        sitekey: siteKey,
        appearance: "interaction-only",
        theme: "dark",
        size: "flexible",
        action,
        callback: (token: string) => {
          onTokenChangeRef.current(token);
        },
        // Keep the widget mounted here. Turnstile defaults to automatic retry
        // and expired-token refresh, so these callbacks should clear stale
        // tokens without forcing the auth UI into a terminal reload state.
        "error-callback": () => {
          onTokenChangeRef.current(null);
        },
        "expired-callback": () => {
          onTokenChangeRef.current(null);
        },
      });
    } catch (error) {
      reportClientError({
        source: "turnstile.render-failed",
        error,
        context: {
          action: action ?? null,
        },
      });
      handleUnavailable();
    }
  }, [siteKey, action, handleUnavailable]);

  useEffect(() => {
    loadTurnstileScript()
      .then(renderWidget)
      .catch((error) => {
        reportClientError({
          source: "turnstile.script-load-failed",
          error,
          context: {
            action: action ?? null,
          },
        });
        handleUnavailable();
      });

    return () => {
      if (widgetIdRef.current !== null && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [action, handleUnavailable, renderWidget]);

  useEffect(() => {
    if (resetKey !== undefined && widgetIdRef.current !== null && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
    }
  }, [resetKey]);

  return <div ref={containerRef} />;
}
