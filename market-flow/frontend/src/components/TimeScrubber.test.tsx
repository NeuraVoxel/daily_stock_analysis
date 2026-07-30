import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TimeScrubber } from "./TimeScrubber";

const marks = [
  "2026-07-30T09:30:00+08:00",
  "2026-07-30T10:00:00+08:00",
  "2026-07-30T10:30:00+08:00",
  "2026-07-30T15:00:00+08:00",
];

describe("TimeScrubber", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("disables when unsupported", () => {
    render(
      <TimeScrubber
        enabled={false}
        marks={[]}
        value={null}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("slider")).toBeDisabled();
  });

  it("auto-advances marks while playing", () => {
    const onChange = vi.fn();
    const onPlayingChange = vi.fn();
    render(
      <TimeScrubber
        enabled
        marks={marks}
        value={marks[0]!}
        onChange={onChange}
        playing
        onPlayingChange={onPlayingChange}
        frameMs={100}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(onChange).toHaveBeenCalledWith(marks[1]);
  });

  it("play button restarts from the open when at the close", () => {
    const onChange = vi.fn();
    const onPlayingChange = vi.fn();
    render(
      <TimeScrubber
        enabled
        marks={marks}
        value={marks[marks.length - 1]!}
        onChange={onChange}
        playing={false}
        onPlayingChange={onPlayingChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "播放" }));
    expect(onChange).toHaveBeenCalledWith(marks[0]);
    expect(onPlayingChange).toHaveBeenCalledWith(true);
  });
});
