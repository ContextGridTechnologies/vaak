import type { VoiceCapsuleAnchor, VoiceCapsulePlacement } from "@/lib/tauri";

import { DEFAULT_EDGE_OFFSET, SNAP_ANCHORS } from "./constants";

export type { VoiceCapsulePlacement } from "@/lib/tauri";

export type CapsuleWindowSize = {
  width: number;
  height: number;
};

export type WorkAreaRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CapsulePosition = {
  x: number;
  y: number;
};

export function resolvePlacementPosition({
  placement,
  windowSize,
  workArea,
}: {
  placement: VoiceCapsulePlacement;
  windowSize: CapsuleWindowSize;
  workArea: WorkAreaRect;
}): CapsulePosition {
  const offsetX = placement.offsetX ?? defaultOffsetX(placement.anchor);
  const offsetY = placement.offsetY ?? defaultOffsetY(placement.anchor);
  const centeredX = workArea.x + (workArea.width - windowSize.width) / 2;
  const centeredY = workArea.y + (workArea.height - windowSize.height) / 2;
  const rightX = workArea.x + workArea.width - windowSize.width - offsetX;
  const topY = workArea.y + offsetY;
  const bottomY = workArea.y + workArea.height - windowSize.height - offsetY;

  const position = (() => {
    switch (placement.anchor) {
    case "bottomCenter":
      return {
        x: centeredX + offsetX,
        y: bottomY,
      };
    case "bottomLeft":
      return {
        x: workArea.x + offsetX,
        y: bottomY,
      };
    case "bottomRight":
      return {
        x: rightX,
        y: bottomY,
      };
    case "centerLeft":
      return {
        x: workArea.x + offsetX,
        y: centeredY + offsetY,
      };
    case "centerRight":
      return {
        x: rightX,
        y: centeredY + offsetY,
      };
    case "topCenter":
      return {
        x: centeredX + offsetX,
        y: topY,
      };
    }
  })();

  return clampPositionToWorkArea(position, windowSize, workArea);
}

export function createSnapPlacementFromPosition({
  currentPosition,
  windowSize,
  workArea,
}: {
  currentPosition: CapsulePosition;
  windowSize: CapsuleWindowSize;
  workArea: WorkAreaRect;
}): VoiceCapsulePlacement {
  const anchor = nearestAnchor(currentPosition, windowSize, workArea);
  const centeredX = workArea.x + (workArea.width - windowSize.width) / 2;
  const centeredY = workArea.y + (workArea.height - windowSize.height) / 2;
  const rightEdge = workArea.x + workArea.width - windowSize.width - currentPosition.x;
  const topEdge = currentPosition.y - workArea.y;
  const bottomEdge = workArea.y + workArea.height - windowSize.height - currentPosition.y;

  switch (anchor) {
    case "bottomCenter":
      return {
        anchor,
        offsetX: roundToTwo(currentPosition.x - centeredX),
        offsetY: roundToTwo(bottomEdge),
      };
    case "bottomLeft":
      return {
        anchor,
        offsetX: roundToTwo(currentPosition.x - workArea.x),
        offsetY: roundToTwo(bottomEdge),
      };
    case "bottomRight":
      return {
        anchor,
        offsetX: roundToTwo(rightEdge),
        offsetY: roundToTwo(bottomEdge),
      };
    case "centerLeft":
      return {
        anchor,
        offsetX: roundToTwo(currentPosition.x - workArea.x),
        offsetY: roundToTwo(currentPosition.y - centeredY),
      };
    case "centerRight":
      return {
        anchor,
        offsetX: roundToTwo(rightEdge),
        offsetY: roundToTwo(currentPosition.y - centeredY),
      };
    case "topCenter":
      return {
        anchor,
        offsetX: roundToTwo(currentPosition.x - centeredX),
        offsetY: roundToTwo(topEdge),
      };
  }
}

function nearestAnchor(
  currentPosition: CapsulePosition,
  windowSize: CapsuleWindowSize,
  workArea: WorkAreaRect,
): VoiceCapsuleAnchor {
  let nearest = SNAP_ANCHORS[0];
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const anchor of SNAP_ANCHORS) {
    const target = resolvePlacementPosition({
      placement: { anchor },
      windowSize,
      workArea,
    });
    const distance = Math.hypot(
      currentPosition.x - target.x,
      currentPosition.y - target.y,
    );

    if (distance < nearestDistance) {
      nearest = anchor;
      nearestDistance = distance;
    }
  }

  return nearest;
}

function defaultOffsetX(anchor: VoiceCapsuleAnchor): number {
  return anchor === "bottomCenter" || anchor === "topCenter"
    ? 0
    : DEFAULT_EDGE_OFFSET;
}

function defaultOffsetY(anchor: VoiceCapsuleAnchor): number {
  return anchor === "centerLeft" || anchor === "centerRight"
    ? 0
    : DEFAULT_EDGE_OFFSET;
}

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function clampPositionToWorkArea(
  position: CapsulePosition,
  windowSize: CapsuleWindowSize,
  workArea: WorkAreaRect,
): CapsulePosition {
  const maxX = workArea.x + Math.max(0, workArea.width - windowSize.width);
  const maxY = workArea.y + Math.max(0, workArea.height - windowSize.height);

  return {
    x: clampFinite(position.x, workArea.x, maxX),
    y: clampFinite(position.y, workArea.y, maxY),
  };
}

function clampFinite(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}
