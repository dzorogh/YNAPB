import { describe, it, expect } from "vitest";
import { computePlan } from "./planner";
import { M, goal, budget } from "./fixtures";

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

    for (let i = 0; i < 5; i++) {
      const monthAllocation = result.allocations[i];
      expect(monthAllocation?.perGoal.renovation).toBeCloseTo(200_000, -2);
      expect(monthAllocation?.perGoal.car).toBeCloseTo(150_000, -2);
    }

    for (let i = 5; i < 20; i++) {
      const monthAllocation = result.allocations[i];
      expect(monthAllocation?.perGoal.renovation ?? 0).toBe(0);
      expect(monthAllocation?.perGoal.car).toBeCloseTo(283_333, -2);
    }

    for (let i = 20; i < 24; i++) {
      const monthAllocation = result.allocations[i];
      expect(monthAllocation?.perGoal.renovation ?? 0).toBe(0);
      expect(monthAllocation?.perGoal.car ?? 0).toBe(0);
    }
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
