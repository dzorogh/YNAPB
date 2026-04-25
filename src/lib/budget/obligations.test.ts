import { describe, expect, it } from "vitest";

import { computeMonthlyBudget } from "./obligations";

type YnabCategoryForBudget = {
  id: string;
  name: string;
  goal_type: string | null;
  assigned_history: number[];
  hidden: boolean;
  deleted: boolean;
};

describe("computeMonthlyBudget", () => {
  it("uses average assigned history and keeps exclusion filters", () => {
    const categories: YnabCategoryForBudget[] = [
      {
        id: "rent",
        name: "Rent",
        goal_type: "NEED",
        assigned_history: [12_000, 8_000, 10_000],
        hidden: false,
        deleted: false,
      },
      {
        id: "insurance",
        name: "Insurance",
        goal_type: "NEED",
        assigned_history: [9_000, 9_000, 8_000],
        hidden: false,
        deleted: false,
      },
      {
        id: "vacation",
        name: "Vacation",
        goal_type: "TBD",
        assigned_history: [40_000, 40_000, 40_000],
        hidden: false,
        deleted: false,
      },
      {
        id: "manual-goal",
        name: "Manual Goal",
        goal_type: null,
        assigned_history: [100_000, 100_000, 100_000],
        hidden: false,
        deleted: false,
      },
      {
        id: "car-loan",
        name: "Car Loan",
        goal_type: "DEBT",
        assigned_history: [58_770, 58_770, 58_770],
        hidden: false,
        deleted: false,
      },
      {
        id: "food",
        name: "Food",
        goal_type: "TB",
        assigned_history: [0, 5_000],
        hidden: false,
        deleted: false,
      },
      {
        id: "old-credit",
        name: "Old Credit",
        goal_type: "DEBT",
        assigned_history: [40_000, 40_000, 40_000],
        hidden: true,
        deleted: false,
      },
    ];

    const result = computeMonthlyBudget({
      categories,
      activeGoalCategoryIds: ["vacation"],
      plannedIncome: 200_000,
    });

    expect(result.obligations).toBe(79_937);
    expect(result.available).toBe(120_063);
    expect(result.obligationBreakdown).toEqual([
      {
        categoryId: "rent",
        categoryName: "Rent",
        amount: 10_000,
      },
      {
        categoryId: "insurance",
        categoryName: "Insurance",
        amount: 8_667,
      },
      {
        categoryId: "car-loan",
        categoryName: "Car Loan",
        amount: 58_770,
      },
      {
        categoryId: "food",
        categoryName: "Food",
        amount: 2_500,
      },
    ]);
  });
});
