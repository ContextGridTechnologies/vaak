import { Component, type ErrorInfo, type ReactNode } from "react";

import { isTauriRuntime, recordRendererError } from "@/lib/tauri";

type RendererErrorBoundaryProps = {
  windowLabel: string;
  children: ReactNode;
};

type RendererErrorBoundaryState = {
  hasError: boolean;
};

export class RendererErrorBoundary extends Component<
  RendererErrorBoundaryProps,
  RendererErrorBoundaryState
> {
  state: RendererErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): RendererErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (isTauriRuntime()) {
      void recordRendererError({
        windowLabel: this.props.windowLabel,
        message: `${error.message}\n${errorInfo.componentStack ?? ""}`,
      }).catch(() => {});
    }

    if (this.props.windowLabel === "voice-capsule") {
      window.setTimeout(() => {
        window.location.reload();
      }, 1_000);
    }
  }

  render() {
    if (this.state.hasError) {
      return null;
    }

    return this.props.children;
  }
}
