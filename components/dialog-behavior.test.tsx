// @vitest-environment jsdom

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { useDialogBehavior } from "./dialog-behavior";

const originalOffsetParent = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetParent");

beforeAll(() => {
  // jsdom does not lay elements out. Treat mounted elements as visible so the
  // production focus-trap visibility check follows its browser branch.
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get() { return this.parentElement; },
  });
});

afterEach(cleanup);

afterAll(() => {
  if (originalOffsetParent) Object.defineProperty(HTMLElement.prototype, "offsetParent", originalOffsetParent);
  else delete (HTMLElement.prototype as unknown as { offsetParent?: Element }).offsetParent;
});

function DialogHarness() {
  const [open, setOpen] = useState(false);
  const ref = useDialogBehavior(open, () => setOpen(false));
  return <>
    <button type="button" onClick={() => setOpen(true)}>打开详情</button>
    {open && <section ref={ref} tabIndex={-1} role="dialog" aria-label="时段详情">
      <button type="button">第一个操作</button>
      <input aria-label="备注" />
      <button type="button">最后一个操作</button>
    </section>}
  </>;
}

describe("shared dialog keyboard behavior", () => {
  it("moves focus into the dialog, traps Tab, closes on Escape and restores the trigger", async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    const trigger = screen.getByRole("button", { name: "打开详情" });

    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "时段详情" });
    expect(document.activeElement).toBe(dialog);

    const first = screen.getByRole("button", { name: "第一个操作" });
    const last = screen.getByRole("button", { name: "最后一个操作" });
    last.focus();
    await user.tab();
    expect(document.activeElement).toBe(first);

    await user.tab({ shift: true });
    expect(document.activeElement).toBe(last);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "时段详情" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
