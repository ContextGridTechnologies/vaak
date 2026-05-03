import type { VoiceCapsuleAnchor, VoiceCapsulePlacement } from "@/lib/tauri";

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

const DEFAULT_EDGE_OFFSET = 24;

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
  const bottomY = workArea.y + workArea.height - windowSize.height - offsetY;

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
  }
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
  }
}

function nearestAnchor(
  currentPosition: CapsulePosition,
  windowSize: CapsuleWindowSize,
  workArea: WorkAreaRect,
): VoiceCapsuleAnchor {
  const anchors: VoiceCapsuleAnchor[] = [
    "bottomCenter",
    "bottomLeft",
    "bottomRight",
    "centerLeft",
    "centerRight",
  ];

  let nearest = anchors[0];
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const anchor of anchors) {
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
  return anchor === "bottomCenter" ? 0 : DEFAULT_EDGE_OFFSET;
}

function defaultOffsetY(anchor: VoiceCapsuleAnchor): number {
  return anchor === "centerLeft" || anchor === "centerRight"
    ? 0
    : DEFAULT_EDGE_OFFSET;
}

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}
