import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import { FloatingVoiceWindow } from "./features/floating/FloatingVoiceWindow";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {new URLSearchParams(globalThis.location.search).get("window") ===
    "voice-capsule" ? (
      <FloatingVoiceWindow />
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
