import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import { RendererErrorBoundary } from "./app/RendererErrorBoundary";
import { installRendererStabilityHooks } from "./app/stability";
import "./config/app-env";
import { FloatingVoiceWindow } from "./features/floating/FloatingVoiceWindow";

const windowLabel =
  new URLSearchParams(globalThis.location.search).get("window") ===
  "voice-capsule"
    ? "voice-capsule"
    : "main";

installRendererStabilityHooks(windowLabel);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RendererErrorBoundary windowLabel={windowLabel}>
      {windowLabel === "voice-capsule" ? <FloatingVoiceWindow /> : <App />}
    </RendererErrorBoundary>
  </React.StrictMode>,
);
