import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useRef,
  useState,
} from "react";

import { isTauriRuntime, saveVoiceCapsulePlacement } from "@/lib/tauri";

import {
  VOICE_CAPSULE_DRAG_THRESHOLD,
  VOICE_CAPSULE_WINDOW_SIZE,
} from "./constants";
import {
  createSnapPlacementFromPosition,
  resolvePlacementPosition,
} from "./placement";
import {
  getFloatingMonitorWorkArea,
  getFloatingWindowStartState,
  moveFloatingWindow,
} from "./window-controller";

type DragState = {
  pointerId: number;
  startScreenX: number;
  startScreenY: number;
  startWindowX: number;
  startWindowY: number;
  hasDragged: boolean;
  moveSequence: number;
  positionReady: Promise<void>;
};

export function useVoiceCapsuleDrag() {
  const dragStateRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);
  const [movementError, setMovementError] = useState<string | null>(null);

  const consumeSuppressedClick = useCallback(() => {
    if (!suppressClickRef.current) {
      return false;
    }

    suppressClickRef.current = false;
    return true;
  }, []);

  const handleMovementError = useCallback((err: unknown) => {
    const message =
      err instanceof Error ? err.message : "Unable to move voice capsule.";
    setMovementError(message);
  }, []);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0 || !isTauriRuntime()) {
        return;
      }

      setMovementError(null);
      event.currentTarget.setPointerCapture(event.pointerId);

      const dragState: DragState = {
        pointerId: event.pointerId,
        startScreenX: event.screenX,
        startScreenY: event.screenY,
        startWindowX: 0,
        startWindowY: 0,
        hasDragged: false,
        moveSequence: 0,
        positionReady: Promise.resolve(),
      };

      dragState.positionReady = (async () => {
        const position = await getFloatingWindowStartState();

        dragState.startWindowX = position.x;
        dragState.startWindowY = position.y;
      })().catch((err: unknown) => {
        handleMovementError(err);
        throw err;
      });

      dragStateRef.current = dragState;
    },
    [handleMovementError],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      const deltaX = event.screenX - dragState.startScreenX;
      const deltaY = event.screenY - dragState.startScreenY;

      if (
        !dragState.hasDragged &&
        Math.hypot(deltaX, deltaY) < VOICE_CAPSULE_DRAG_THRESHOLD
      ) {
        return;
      }

      dragState.hasDragged = true;
      suppressClickRef.current = true;
      const moveSequence = ++dragState.moveSequence;

      void (async () => {
        await dragState.positionReady;
        if (
          dragStateRef.current !== dragState ||
          dragState.moveSequence !== moveSequence
        ) {
          return;
        }
        await moveFloatingWindow({
          x: dragState.startWindowX + deltaX,
          y: dragState.startWindowY + deltaY,
        });
      })().catch(handleMovementError);
    },
    [handleMovementError],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const dragState = dragStateRef.current;
      dragStateRef.current = null;

      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      releasePointerCapture(event.currentTarget, event.pointerId);

      if (!dragState.hasDragged) {
        return;
      }

      void (async () => {
        await dragState.positionReady;

        const deltaX = event.screenX - dragState.startScreenX;
        const deltaY = event.screenY - dragState.startScreenY;
        const workArea = await getFloatingMonitorWorkArea();

        if (!workArea) {
          return;
        }

        const currentPosition = {
          x: dragState.startWindowX + deltaX,
          y: dragState.startWindowY + deltaY,
        };
        const placement = createSnapPlacementFromPosition({
          currentPosition,
          windowSize: VOICE_CAPSULE_WINDOW_SIZE,
          workArea,
        });
        const snappedPosition = resolvePlacementPosition({
          placement,
          windowSize: VOICE_CAPSULE_WINDOW_SIZE,
          workArea,
        });
        await moveFloatingWindow(snappedPosition);
        await saveVoiceCapsulePlacement(placement);
      })().catch(handleMovementError);
    },
    [handleMovementError],
  );

  const onPointerCancel = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const dragState = dragStateRef.current;
    dragStateRef.current = null;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    releasePointerCapture(event.currentTarget, event.pointerId);
  }, []);

  return {
    consumeSuppressedClick,
    movementError,
    pointerHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
    },
  };
}

function releasePointerCapture(target: HTMLElement, pointerId: number) {
  if (
    typeof target.hasPointerCapture === "function" &&
    !target.hasPointerCapture(pointerId)
  ) {
    return;
  }

  try {
    target.releasePointerCapture(pointerId);
  } catch {
    // Pointer capture may already be gone after OS-level cancellation.
  }
}
