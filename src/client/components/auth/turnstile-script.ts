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
