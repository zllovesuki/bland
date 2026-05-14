import { AlertCircle } from "lucide-react";
import { Button } from "@/client/components/ui/button";

export function RouteErrorFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-400" />
        <p className="mb-3 text-sm text-zinc-400">Something went wrong.</p>
        <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    </div>
  );
}
