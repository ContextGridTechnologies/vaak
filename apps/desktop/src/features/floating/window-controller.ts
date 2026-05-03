import { LogicalPosition, currentMonitor, getCurrentWindow } from "@tauri-apps/api/window";

import type { CapsulePosition, WorkAreaRect } from "./placement";

export async function getFloatingWindowStartState(): Promise<CapsulePosition> {
  const currentWindow = getCurrentWindow();
  const [position, monitor] = await Promise.all([
    currentWindow.outerPosition(),
    currentMonitor(),
  ]);
  const scaleFactor = monitor?.scaleFactor || 1;

  return {
    x: position.x / scaleFactor,
    y: position.y / scaleFactor,
  };
}

export async function moveFloatingWindow(position: CapsulePosition): Promise<void> {
  await getCurrentWindow().setPosition(new LogicalPosition(position.x, position.y));
}

export async function getFloatingMonitorWorkArea(): Promise<WorkAreaRect | null> {
  const monitor = await currentMonitor();

  if (!monitor) {
    return null;
  }

  const scaleFactor = monitor.scaleFactor || 1;

  return {
    x: monitor.workArea.position.x / scaleFactor,
    y: monitor.workArea.position.y / scaleFactor,
    width: monitor.workArea.size.width / scaleFactor,
    height: monitor.workArea.size.height / scaleFactor,
  };
}
