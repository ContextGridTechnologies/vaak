import { MinusIcon, SquareIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  closeCurrentWindow,
  isTauriRuntime,
  minimizeCurrentWindow,
  toggleMaximizeCurrentWindow,
} from "@/lib/tauri";
import appIconUrl from "../../src-tauri/icons/32x32.png?url";

export function DesktopTitleBar() {
  if (!isTauriRuntime()) {
    return null;
  }

  return (
    <header
      aria-label="Vaak window controls"
      className="flex h-10 shrink-0 items-center justify-between border-b border-border bg-background text-foreground"
      data-tauri-drag-region
    >
      <div className="flex min-w-0 items-center gap-2 px-3" data-tauri-drag-region>
        <img
          src={appIconUrl}
          alt=""
          aria-hidden="true"
          data-testid="desktop-titlebar-brand-mark"
          className="size-5 shrink-0 rounded-md"
        />
        <span className="truncate text-sm font-medium" data-tauri-drag-region>
          Vaak
        </span>
      </div>
      <div className="flex h-full items-center">
        <Button
          aria-label="Minimize window"
          className="h-full rounded-none px-4"
          size="icon"
          variant="ghost"
          onClick={() => void minimizeCurrentWindow()}
        >
          <MinusIcon data-icon="icon" />
        </Button>
        <Button
          aria-label="Maximize window"
          className="h-full rounded-none px-4"
          size="icon"
          variant="ghost"
          onClick={() => void toggleMaximizeCurrentWindow()}
        >
          <SquareIcon data-icon="icon" />
        </Button>
        <Button
          aria-label="Close window"
          className="h-full rounded-none px-4 hover:bg-destructive/10 hover:text-destructive"
          size="icon"
          variant="ghost"
          onClick={() => void closeCurrentWindow()}
        >
          <XIcon data-icon="icon" />
        </Button>
      </div>
    </header>
  );
}
