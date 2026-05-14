import { useEffect, useEffectEvent, useRef } from "react";
import { reportClientError } from "@/client/lib/report-client-error";
import { loadTurnstileScript } from "./turnstile-script";

interface TurnstileWidgetProps {
  siteKey: string;
  onTokenChange: (token: string | null) => void;
  onUnavailable?: () => void;
  action?: string;
  resetKey?: number;
}

export function TurnstileWidget({ siteKey, onTokenChange, onUnavailable, action, resetKey }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  const emitTokenChange = useEffectEvent((token: string | null) => {
    onTokenChange(token);
  });

  const handleUnavailable = useEffectEvent(() => {
    onTokenChange(null);
    onUnavailable?.();
  });

  useEffect(() => {
    const renderWidget = () => {
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
            emitTokenChange(token);
          },
          // Keep the widget mounted here. Turnstile defaults to automatic retry
          // and expired-token refresh, so these callbacks should clear stale
          // tokens without forcing the auth UI into a terminal reload state.
          "error-callback": () => {
            emitTokenChange(null);
          },
          "expired-callback": () => {
            emitTokenChange(null);
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
    };

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
  }, [action, siteKey]);

  useEffect(() => {
    if (resetKey !== undefined && widgetIdRef.current !== null && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
    }
  }, [resetKey]);

  return <div ref={containerRef} />;
}
