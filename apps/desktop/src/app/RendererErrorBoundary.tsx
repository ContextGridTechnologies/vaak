import { Component, type ErrorInfo, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  isTauriRuntime,
  recordRendererError,
  recordStartupCheckpoint,
} from "@/lib/tauri";

type RendererErrorBoundaryProps = {
  windowLabel: string;
  children: ReactNode;
  reloadWindow?: () => void;
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

      if (this.props.windowLabel !== "voice-capsule") {
        void recordStartupCheckpoint({
          windowLabel: this.props.windowLabel,
          checkpoint: "renderer_recovery_displayed",
          detail: error.message,
        }).catch(() => {});
      }
    }

    if (this.props.windowLabel === "voice-capsule") {
      window.setTimeout(() => {
        this.reloadWindow();
      }, 1_000);
    }
  }

  private reloadWindow = () => {
    if (this.props.reloadWindow) {
      this.props.reloadWindow();
      return;
    }

    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.windowLabel === "voice-capsule") {
        return null;
      }

      return (
        <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
          <section
            aria-labelledby="startup-recovery-title"
            className="w-full max-w-sm space-y-4 text-center"
          >
            <div className="space-y-2">
              <h1
                id="startup-recovery-title"
                className="text-xl font-semibold tracking-normal"
              >
                Vaak
              </h1>
              <p className="text-sm text-muted-foreground">
                Vaak hit a startup problem in this window.
              </p>
            </div>
            <Button type="button" onClick={this.reloadWindow}>
              <RefreshCw aria-hidden="true" />
              Reload
            </Button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
