// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { ThemedSelect } from "./themed-select";

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(cleanup);

function SelectHarness() {
  const [value, setValue] = useState("monday");
  return <ThemedSelect
    searchable
    value={value}
    ariaLabel="选择星期"
    groups={[{ options: [
      { value: "monday", label: "周一" },
      { value: "tuesday", label: "周二" },
      { value: "wednesday", label: "周三" },
    ] }]}
    onChange={setValue}
  />;
}

describe("ThemedSelect keyboard interaction", () => {
  it("opens, moves through options, selects and dismisses without a pointer", async () => {
    const user = userEvent.setup();
    render(<SelectHarness />);
    const input = screen.getByRole("combobox", { name: "选择星期" }) as HTMLInputElement;

    input.focus();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(input.value).toBe("周二");
    expect(input.getAttribute("aria-expanded")).toBe("false");

    input.focus();
    await user.clear(input);
    await user.type(input, "三");
    expect(screen.getAllByRole("option")).toHaveLength(1);
    await user.keyboard("{Enter}");
    expect(input.value).toBe("周三");

    await user.click(input);
    expect(input.getAttribute("aria-expanded")).toBe("true");
    await user.keyboard("{Escape}");
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });
});
