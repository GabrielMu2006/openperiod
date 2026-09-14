import { describe, expect, it } from "vitest";
import { diffCourseMeetings } from "./meeting-diff";

const base = { weekday: 1, startPeriod: 1, endPeriod: 2 };

describe("diffCourseMeetings", () => {
  it("keeps unchanged meetings so their skip records survive a rename", () => {
    const diff = diffCourseMeetings([{ id: "m1", ...base, weeks: [1, 2, 3] }], [
      { ...base, weeks: [1, 2, 3] },
    ]);
    expect(diff).toEqual({ keptIds: ["m1"], removedIds: [], inserts: [] });
  });

  it("removes and re-inserts a meeting whose time or weeks changed", () => {
    const diff = diffCourseMeetings([{ id: "m1", ...base, weeks: [1, 2, 3] }], [
      { ...base, weeks: [1, 2, 3, 4] },
    ]);
    expect(diff.keptIds).toEqual([]);
    expect(diff.removedIds).toEqual(["m1"]);
    expect(diff.inserts).toEqual([{ ...base, weeks: [1, 2, 3, 4] }]);
  });

  it("keeps surviving meetings of a multi-weekday course while replacing the edited one", () => {
    const monday = { id: "mon", weekday: 1, startPeriod: 3, endPeriod: 4, weeks: [1, 2] };
    const thursday = { id: "thu", weekday: 4, startPeriod: 3, endPeriod: 4, weeks: [1, 2] };
    const diff = diffCourseMeetings([monday, thursday], [
      { weekday: 1, startPeriod: 3, endPeriod: 4, weeks: [1, 2] },
      { weekday: 4, startPeriod: 5, endPeriod: 6, weeks: [1, 2] },
    ]);
    expect(diff.keptIds).toEqual(["mon"]);
    expect(diff.removedIds).toEqual(["thu"]);
    expect(diff.inserts).toEqual([{ weekday: 4, startPeriod: 5, endPeriod: 6, weeks: [1, 2] }]);
  });

  it("inserts new meetings and keeps weeks order normalized", () => {
    const diff = diffCourseMeetings([], [{ ...base, weeks: [3, 1, 2] }]);
    expect(diff.inserts).toEqual([{ ...base, weeks: [1, 2, 3] }]);
  });

  it("matches each existing meeting at most once", () => {
    const diff = diffCourseMeetings([{ id: "m1", ...base, weeks: [1] }], [
      { ...base, weeks: [1] },
      { ...base, weeks: [1] },
    ]);
    expect(diff.keptIds).toEqual(["m1"]);
    expect(diff.removedIds).toEqual([]);
    expect(diff.inserts).toEqual([{ ...base, weeks: [1] }]);
  });
});
