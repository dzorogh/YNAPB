import { describe, expect, it } from "vitest";
import { computeMonthlyBudget } from "./obligations";

type YnabCategoryForBudget = {
  id: string;
  name: string;
  goal_type: string | null;
  goal_under_funded: number | null;
};

describe("computeMonthlyBudget", () => {
  it("excludes categories tied to active goals and with null goal_type, computes obligations/available and returns breakdown", () => {
    const categories: YnabCategoryForBudget[] = [
      {
        id: "rent",
        name: "Rent",
        goal_type: "NEED",
        goal_under_funded: 80_000,
      },
      {
        id: "vacation",
        name: "Vacation",
        goal_type: "TBD",
        goal_under_funded: 40_000,
      },
      {
        id: "manual-goal",
        name: "Manual Goal",
        goal_type: null,
        goal_under_funded: 100_000,
      },
      {
        id: "utilities",
        name: "Utilities",
        goal_type: "MF",
        goal_under_funded: 20_000,
      },
      {
        id: "food",
        name: "Food",
        goal_type: "TB",
        goal_under_funded: null,
      },
    ];

    const result = computeMonthlyBudget({
      categories,
      activeGoalCategoryIds: ["vacation"],
      plannedIncome: 200_000,
    });

    expect(result.obligations).toBe(100_000);
    expect(result.available).toBe(100_000);
    expect(result.obligationBreakdown).toEqual([
      {
        categoryId: "rent",
        categoryName: "Rent",
        amount: 80_000,
      },
      {
        categoryId: "utilities",
        categoryName: "Utilities",
        amount: 20_000,
      },
      {
        categoryId: "food",
        categoryName: "Food",
        amount: 0,
      },
    ]);
  });
});
