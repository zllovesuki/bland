import "@vitejs/plugin-react/preamble";
import { bootstrapIslands } from "@/client/sites/hydrate";

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void bootstrapIslands(), { once: true });
} else {
  void bootstrapIslands();
}
