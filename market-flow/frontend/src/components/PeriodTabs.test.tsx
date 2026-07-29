import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PeriodTabs } from "./PeriodTabs";

describe("PeriodTabs", () => {
  it("emits period on click", () => {
    const onChange = vi.fn();
    render(<PeriodTabs value="realtime" onChange={onChange} />);
    fireEvent.click(screen.getByRole("tab", { name: "每周" }));
    expect(onChange).toHaveBeenCalledWith("week");
  });
});
