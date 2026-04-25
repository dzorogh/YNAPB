import { describe, it, expect } from "vitest";
import { computePlan } from "./planner";
import { M, goal, budget } from "./fixtures";

const expectRangeAllocation = (
  perMonth: ReturnType<typeof computePlan>["allocations"],
  startIndex: number,
  endIndexExclusive: number,
  expectedRenovation: number,
  expectedCar: number,
): void => {
  for (let i = startIndex; i < endIndexExclusive; i++) {
    const monthAllocation = perMonth[i];
    expect(monthAllocation?.perGoal.renovation ?? 0).toBeCloseTo(expectedRenovation, -2);
    expect(monthAllocation?.perGoal.car ?? 0).toBeCloseTo(expectedCar, -2);
  }
};

describe("planner - basic distribution (spec §6 example)", () => {
  it("two goals with different deadlines: closer is funded first", () => {
    const goals = [
      goal({ id: "renovation", targetAmount: 1_000_000, deadline: M(2026, 9) }),
      goal({ id: "car", targetAmount: 5_000_000, deadline: M(2027, 12) }),
    ];
    const result = computePlan({
      goals,
      budget: budget(350_000),
      startMonth: M(2026, 5),
      horizonMonths: 24,
    });

    expectRangeAllocation(result.allocations, 0, 5, 200_000, 150_000);
    expectRangeAllocation(result.allocations, 5, 20, 0, 283_333);
    expectRangeAllocation(result.allocations, 20, 24, 0, 0);
  });
});

describe("planner - starting balances", () => {
  it("does not over-fund a goal with existing balance", () => {
    const goals = [
      goal({ id: "phone", targetAmount: 100_000, currentBalance: 80_000, deadline: M(2026, 6) }),
    ];
    const result = computePlan({
      goals,
      budget: budget(50_000),
      startMonth: M(2026, 5),
      horizonMonths: 6,
    });
    const totalAllocated =
      (result.allocations[0]?.perGoal.phone ?? 0) +
      (result.allocations[1]?.perGoal.phone ?? 0);
    expect(totalAllocated).toBeCloseTo(20_000, -1);
  });

  it("treats already-completed goals as completed (zero remaining)", () => {
    const goals = [
      goal({ id: "done", targetAmount: 100_000, currentBalance: 100_000, deadline: M(2026, 6) }),
    ];
    const result = computePlan({
      goals,
      budget: budget(50_000),
      startMonth: M(2026, 5),
      horizonMonths: 3,
    });
    for (const monthAllocation of result.allocations) {
      expect(monthAllocation.perGoal.done ?? 0).toBe(0);
    }
  });
});

describe("planner - unallocated budget", () => {
  it("reports remaining budget as unallocated when goals are fully funded", () => {
    const goals = [
      goal({ id: "small", targetAmount: 50_000, deadline: M(2026, 6) }),
    ];
    const result = computePlan({
      goals,
      budget: budget(200_000),
      startMonth: M(2026, 5),
      horizonMonths: 4,
    });
    expect(result.allocations[0]?.unallocated).toBeCloseTo(175_000, -1);
    expect(result.allocations[1]?.unallocated).toBeCloseTo(175_000, -1);
    expect(result.allocations[2]?.unallocated).toBeCloseTo(200_000, -1);
    expect(result.allocations[3]?.unallocated).toBeCloseTo(200_000, -1);
  });
});

describe("planner - unreachable goals", () => {
  it("flags a goal that cannot be funded by its deadline at current budget", () => {
    const goals = [
      goal({ id: "cottage", targetAmount: 10_000_000, deadline: M(2027, 6) }),
    ];
    const result = computePlan({
      goals,
      budget: budget(100_000),
      startMonth: M(2026, 1),
      horizonMonths: 240,
    });
    const conflict = result.conflicts.find(
      (entry) => entry.type === "unreachable" && entry.goalId === "cottage",
    );
    expect(conflict).toBeDefined();
    if (conflict?.type === "unreachable") {
      expect(conflict.earliestAchievable).toEqual(M(2032, 10));
    }
  });

  it("does not flag a reachable goal", () => {
    const goals = [
      goal({ id: "ok", targetAmount: 100_000, deadline: M(2026, 12) }),
    ];
    const result = computePlan({
      goals,
      budget: budget(50_000),
      startMonth: M(2026, 1),
      horizonMonths: 24,
    });
    expect(result.conflicts).toHaveLength(0);
  });
});

describe("planner - tied deadlines", () => {
  it("flags two goals sharing the same month deadline when budget cannot cover both", () => {
    const goals = [
      goal({ id: "a", targetAmount: 600_000, deadline: M(2026, 8), createdAt: M(2026, 1) }),
      goal({ id: "b", targetAmount: 600_000, deadline: M(2026, 8), createdAt: M(2026, 2) }),
    ];
    const result = computePlan({
      goals,
      budget: budget(250_000),
      startMonth: M(2026, 5),
      horizonMonths: 6,
    });
    const conflict = result.conflicts.find((entry) => entry.type === "tied_deadline");
    expect(conflict).toBeDefined();
    if (conflict?.type === "tied_deadline") {
      expect(conflict.goalIds.sort()).toEqual(["a", "b"]);
      expect(conflict.deadline).toEqual(M(2026, 8));
    }
  });

  it("does not flag tied deadlines if budget is sufficient", () => {
    const goals = [
      goal({ id: "a", targetAmount: 100_000, deadline: M(2026, 8) }),
      goal({ id: "b", targetAmount: 100_000, deadline: M(2026, 8) }),
    ];
    const result = computePlan({
      goals,
      budget: budget(200_000),
      startMonth: M(2026, 5),
      horizonMonths: 6,
    });
    expect(
      result.conflicts.filter((entry) => entry.type === "tied_deadline"),
    ).toHaveLength(0);
  });
});

describe("planner - frozen goals", () => {
  it("does not allocate to frozen goals", () => {
    const goals = [
      goal({ id: "active", targetAmount: 100_000, deadline: M(2026, 8) }),
      goal({ id: "frozen", targetAmount: 100_000, deadline: M(2026, 8), status: "frozen" }),
    ];
    const result = computePlan({
      goals,
      budget: budget(100_000),
      startMonth: M(2026, 5),
      horizonMonths: 6,
    });
    for (const monthAllocation of result.allocations) {
      expect(monthAllocation.perGoal.frozen ?? 0).toBe(0);
    }
  });
});

describe("planner - auto-freeze overdue", () => {
  it("auto-freezes a goal whose deadline already passed before startMonth", () => {
    const goals = [
      goal({
        id: "expired",
        targetAmount: 100_000,
        currentBalance: 50_000,
        deadline: M(2025, 12),
      }),
    ];
    const result = computePlan({
      goals,
      budget: budget(100_000),
      startMonth: M(2026, 5),
      horizonMonths: 6,
    });
    expect(result.autoFrozenGoalIds).toContain("expired");
    for (const monthAllocation of result.allocations) {
      expect(monthAllocation.perGoal.expired ?? 0).toBe(0);
    }
  });
});

describe("planner - deterministic tie-break", () => {
  it("when deadlines tie, the earlier-created goal is funded first", () => {
    const earlier = goal({
      id: "earlier",
      targetAmount: 200_000,
      deadline: M(2026, 8),
      createdAt: M(2026, 1),
    });
    const later = goal({
      id: "later",
      targetAmount: 200_000,
      deadline: M(2026, 8),
      createdAt: M(2026, 3),
    });
    const result = computePlan({
      goals: [later, earlier],
      budget: budget(100_000),
      startMonth: M(2026, 5),
      horizonMonths: 6,
    });
    const earlierFirst = (result.allocations[0]?.perGoal.earlier ?? 0)
      >= (result.allocations[0]?.perGoal.later ?? 0);
    expect(earlierFirst).toBe(true);
  });
});
