import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { renderApp } from "@/test/render";

import { AudioPlayback } from "./AudioPlayback";

describe("AudioPlayback", () => {
  it("renders an explicit download control for saved audio", async () => {
    const onDownload = vi.fn();

    renderApp(
      <AudioPlayback
        audioUrl="blob:recording"
        onDownload={onDownload}
      />,
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Download audio" }));

    expect(onDownload).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("audio-playback-element")).toHaveAttribute(
      "controlslist",
      "nodownload",
    );
  });
});
