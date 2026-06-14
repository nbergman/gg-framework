import ReactDOM from "react-dom/client";
import { error as logError, attachConsole } from "@tauri-apps/plugin-log";
// Self-hosted Geist Sans + Mono (bundled by Vite → works offline in the
// packaged app). Imported before App so the @font-face rules land ahead of the
// stylesheet that references them.
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import App from "./App";

// Mirror Rust-side logs into the devtools console, and forward uncaught
// webview errors into the shared log file so failures aren't invisible.
void attachConsole();
window.addEventListener("error", (e) => {
  void logError(`window.error: ${e.message}`);
});
window.addEventListener("unhandledrejection", (e) => {
  void logError(`unhandledrejection: ${String(e.reason)}`);
});

// No StrictMode: its intentional double-invocation of effects and state
// updaters double-registers the single Tauri `agent-event` listener and was
// amplifying state-updater impurity. A desktop webview gains nothing from it.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);
