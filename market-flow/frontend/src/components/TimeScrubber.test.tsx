import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TimeScrubber } from "./TimeScrubber";

describe("TimeScrubber", () => {
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
});
