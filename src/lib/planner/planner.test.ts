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
