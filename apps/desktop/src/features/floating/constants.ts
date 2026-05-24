import { voiceCapsuleAnchors } from "@/lib/tauri";

export const VOICE_CAPSULE_WINDOW_SIZE = {
  width: 56,
  height: 36,
} as const;

export const VOICE_CAPSULE_DRAG_THRESHOLD = 6;

export const DEFAULT_EDGE_OFFSET = 24;

export const SNAP_ANCHORS = [...voiceCapsuleAnchors];
