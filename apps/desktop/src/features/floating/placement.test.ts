import { describe, expect, it } from "vitest";

import {
  type VoiceCapsulePlacement,
  createSnapPlacementFromPosition,
  resolvePlacementPosition,
} from "./placement";

const workArea = {
  x: 0,
  y: 0,
  width: 1440,
  height: 860,
};

describe("voice capsule placement", () => {
  it("resolves the default bottom-center placement above the work-area edge", () => {
    const position = resolvePlacementPosition({
      placement: {
        anchor: "bottomCenter",
      },
      windowSize: {
        width: 56,
        height: 36,
      },
      workArea,
    });

    expect(position).toEqual({
      x: 692,
      y: 800,
    });
  });

  it("resolves a top-center placement below the work-area edge", () => {
    const position = resolvePlacementPosition({
      placement: {
        anchor: "topCenter",
      } as VoiceCapsulePlacement,
      windowSize: {
        width: 56,
        height: 36,
      },
      workArea,
    });

    expect(position).toEqual({
      x: 692,
      y: 24,
    });
  });

  it("snaps a dropped capsule near the right edge to a bottom-right placement", () => {
    const placement = createSnapPlacementFromPosition({
      currentPosition: {
        x: 1328,
        y: 796,
      },
      windowSize: {
        width: 56,
        height: 36,
      },
      workArea,
    });

    expect(placement).toEqual<VoiceCapsulePlacement>({
      anchor: "bottomRight",
      offsetX: 56,
      offsetY: 28,
    });
  });

  it("snaps a dropped capsule near the top center to a top-center placement", () => {
    const placement = createSnapPlacementFromPosition({
      currentPosition: {
        x: 704,
        y: 28,
      },
      windowSize: {
        width: 56,
        height: 36,
      },
      workArea,
    });

    expect(placement).toEqual({
      anchor: "topCenter",
      offsetX: 12,
      offsetY: 28,
    });
  });

  it("keeps resolved placement inside the work area when offsets are too large", () => {
    const position = resolvePlacementPosition({
      placement: {
        anchor: "bottomRight",
        offsetX: 5000,
        offsetY: -200,
      },
      windowSize: {
        width: 56,
        height: 36,
      },
      workArea,
    });

    expect(position).toEqual({
      x: 0,
      y: 824,
    });
  });
});
