import { describe, expect, it } from "vitest";
import { calculateAvailabilitySlot } from "./availability";
import type { ScheduleDataset } from "./schedule";

const base: ScheduleDataset = {
  users: [
    { id: "alice", nickname: "Alice", email: "alice@example.com", defaultPrivacyLevel: 1 },
    { id: "bob", nickname: "Bob", email: "bob@example.com", defaultPrivacyLevel: 1 },
  ],
  courses: [
    { id: "ics", userId: "alice", semesterId: "fall", name: "ICS", location: "二教 203" },
  ],
  meetings: [
    {
      id: "ics-wed",
      courseId: "ics",
      weekday: "wednesday",
      startPeriod: 5,
      endPeriod: 6,
      weeks: [1, 3, 5, 7, 9, 11, 13, 15],
    },
  ],
  exceptions: [],
  busyBlocks: [],
};

const query = {
  weekday: "wednesday" as const,
  period: 5,
  selectedUserIds: ["alice", "bob"],
  viewerId: "bob",
};

describe("calculateAvailabilitySlot", () => {
  it("handles odd and even week meetings", () => {
    expect(calculateAvailabilitySlot(base, { ...query, week: 3 }).commonFree).toBe(false);
    expect(calculateAvailabilitySlot(base, { ...query, week: 4 }).commonFree).toBe(true);
  });

  it("treats a skipped meeting as free without exposing the skip", () => {
    const dataset = {
      ...base,
      exceptions: [{ courseMeetingId: "ics-wed", userId: "alice", week: 5, type: "SKIP" as const }],
    };
    const result = calculateAvailabilitySlot(dataset, { ...query, week: 5 });
    expect(result.commonFree).toBe(true);
    expect(result.details[0]).toEqual({ userId: "alice", nickname: "Alice", free: true });
  });

  it("keeps a private busy title private", () => {
    const dataset = {
      ...base,
      meetings: [],
      busyBlocks: [
        {
          id: "gym",
          userId: "alice",
          weekday: "wednesday" as const,
          startPeriod: 5,
          endPeriod: 6,
          weeks: [5],
          title: "健身",
        },
      ],
    };
    const result = calculateAvailabilitySlot(dataset, { ...query, week: 5 });
    expect(result.details[0].label).toBe("忙碌");
    expect(JSON.stringify(result)).not.toContain("健身");
  });

  it("projects course detail according to privacy level", () => {
    const hidden = calculateAvailabilitySlot(base, {
      ...query,
      week: 3,
      privacyByUserId: { alice: 0 },
    });
    const named = calculateAvailabilitySlot(base, {
      ...query,
      week: 3,
      privacyByUserId: { alice: 1 },
    });
    const full = calculateAvailabilitySlot(base, {
      ...query,
      week: 3,
      privacyByUserId: { alice: 2 },
    });

    expect(hidden.details[0].label).toBe("忙碌");
    expect(named.details[0].label).toBe("ICS");
    expect(full.details[0].label).toContain("二教 203");
  });
});
