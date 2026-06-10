import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildMonthlyFundingTargetsForPush,
  computeYnabMonthlyFundingTarget,
  resolveCarryoverFromLastMonth,
  resolveGoalAmountsFromCategory,
  resolveGoalTotalAssigned,
} from "./goal-progress";

describe("resolveGoalTotalAssigned", () => {
  it("sums assigned this month and prior-month available (Беседка)", () => {
    const total = resolveGoalTotalAssigned({
      balance: 36_656,
      assigned: 174_531,
      prior_month_available: 28_125,
      activity: -166_000,
    });

    expect(total).toBe(202_656);
  });

  it("does not double-count when prior_month_available is current available", () => {
    const total = resolveGoalTotalAssigned({
      balance: 54_000,
      assigned: 191_875,
      prior_month_available: 54_000,
      activity: -166_000,
    });

    expect(total).toBe(220_000);
  });
});

describe("computeYnabMonthlyFundingTarget", () => {
  const mayDeadline = "2026-05-01";
  const mayNow = new Date("2026-05-23T12:00:00.000Z");

  it("uses target minus carryover in the deadline month (Беседка → ~192k)", () => {
    const monthly = computeYnabMonthlyFundingTarget({
      targetAmount: 220_000,
      carryoverFromLastMonth: 28_125,
      savedProgress: 202_656,
      deadline: mayDeadline,
      now: mayNow,
    });

    expect(monthly).toBe(191_875);
  });

  it("spreads remaining after saved progress when deadline is in the future", () => {
    const monthly = computeYnabMonthlyFundingTarget({
      targetAmount: 250_000,
      carryoverFromLastMonth: 28_125,
      savedProgress: 202_656,
      deadline: "2026-08-01",
      now: mayNow,
    });

    expect(monthly).toBeCloseTo((250_000 - 202_656) / 4, 5);
  });
});

describe("buildMonthlyFundingTargetsForPush", () => {
  const categories = new Map([
    [
      "cat-gazebo",
      {
        balance: 36_656,
        assigned: 174_531,
        prior_month_available: 28_125,
      },
    ],
  ]);

  it("uses target minus carryover only when push month is the deadline", () => {
    const targets = buildMonthlyFundingTargetsForPush({
      goals: [
        {
          id: "gazebo",
          targetAmount: 220_000,
          deadline: "2026-05-01",
          ynabCategoryId: "cat-gazebo",
        },
      ],
      categoriesById: categories,
      pushMonth: "2026-05",
      plannerAllocationForMonth: { gazebo: 50_000 },
    });

    expect(targets.gazebo).toBe(191_875);
  });

  it("uses planner allocation when deadline is in a future month", () => {
    const targets = buildMonthlyFundingTargetsForPush({
      goals: [
        {
          id: "renovation",
          targetAmount: 1_800_000,
          deadline: "2026-08-01",
          ynabCategoryId: "cat-gazebo",
        },
      ],
      categoriesById: categories,
      pushMonth: "2026-05",
      plannerAllocationForMonth: { renovation: 42_000 },
    });

    expect(targets.renovation).toBe(42_000);
  });

  it("uses target minus carryover when YNAB category month matches push (deadline shifted)", () => {
    const targets = buildMonthlyFundingTargetsForPush({
      goals: [
        {
          id: "gazebo",
          targetAmount: 220_000,
          deadline: "2026-06-01",
          ynabCategoryId: "cat-gazebo",
        },
      ],
      categoriesById: categories,
      categoryNamesById: new Map([["cat-gazebo", "Беседка (2026-05)"]]),
      pushMonth: "2026-05",
      plannerAllocationForMonth: { gazebo: 166_000 },
    });

    expect(targets.gazebo).toBe(191_875);
  });

  it("does not set 166k when stale prior_month_available equals available (Беседка)", () => {
    const staleCache = new Map([
      [
        "cat-gazebo",
        {
          balance: 54_000,
          assigned: 191_875,
          prior_month_available: 54_000,
          activity: -166_000,
        },
      ],
    ]);

    const targets = buildMonthlyFundingTargetsForPush({
      goals: [
        {
          id: "gazebo",
          targetAmount: 220_000,
          deadline: "2026-05-01",
          ynabCategoryId: "cat-gazebo",
        },
      ],
      categoriesById: staleCache,
      categoryGoalTargetsById: new Map([["cat-gazebo", 191_875]]),
      pushMonth: "2026-05",
      plannerAllocationForMonth: { gazebo: 166_000 },
    });

    expect(targets.gazebo).toBe(191_875);
  });
});

describe("resolveCarryoverFromLastMonth", () => {
  it("rejects prior_month_available that equals current available", () => {
    expect(
      resolveCarryoverFromLastMonth({
        balance: 54_000,
        assigned: 191_875,
        prior_month_available: 54_000,
        activity: -166_000,
      }),
    ).toBe(28_125);
  });
});

describe("resolveGoalAmountsFromCategory", () => {
  it("exposes carryover for MF push", () => {
    const amounts = resolveGoalAmountsFromCategory({
      balance: 36_656,
      assigned: 174_531,
      prior_month_available: 28_125,
    });

    expect(amounts.carryoverFromLastMonth).toBe(28_125);
    expect(amounts.currentBalance).toBe(202_656);
    expect(amounts.assignedThisMonth).toBe(174_531);
  });
});

describe("buildMonthlyFundingTargetsForPush assigned clamp", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-10T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const carCategory = new Map([
    [
      "cat-car",
      {
        balance: 406_529,
        assigned: 279_368,
        prior_month_available: 127_161,
        activity: 0,
      },
    ],
  ]);

  it("raises target to assigned this month when assigned exceeds calculated target", () => {
    const targets = buildMonthlyFundingTargetsForPush({
      goals: [
        {
          id: "car",
          targetAmount: 1_500_000,
          deadline: "2027-07-01",
          ynabCategoryId: "cat-car",
        },
      ],
      categoriesById: carCategory,
      pushMonth: "2026-06",
      plannerAllocationForMonth: { car: 37_515 },
    });

    expect(targets.car).toBe(279_368);
  });

  it("does not clamp when push month is not the current calendar month", () => {
    const targets = buildMonthlyFundingTargetsForPush({
      goals: [
        {
          id: "car",
          targetAmount: 1_500_000,
          deadline: "2027-07-01",
          ynabCategoryId: "cat-car",
        },
      ],
      categoriesById: carCategory,
      pushMonth: "2026-07",
      plannerAllocationForMonth: { car: 37_515 },
    });

    expect(targets.car).toBe(37_515);
  });

  it("keeps calculated target when assigned is lower", () => {
    const targets = buildMonthlyFundingTargetsForPush({
      goals: [
        {
          id: "car",
          targetAmount: 1_500_000,
          deadline: "2027-07-01",
          ynabCategoryId: "cat-car",
        },
      ],
      categoriesById: new Map([
        [
          "cat-car",
          {
            balance: 150_000,
            assigned: 20_000,
            prior_month_available: 130_000,
            activity: 0,
          },
        ],
      ]),
      pushMonth: "2026-06",
      plannerAllocationForMonth: { car: 37_515 },
    });

    expect(targets.car).toBe(37_515);
  });
});
