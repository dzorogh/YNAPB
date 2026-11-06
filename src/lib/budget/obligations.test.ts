import { describe, expect, it } from "vitest";

import { computeMonthlyBudget } from "./obligations";

type YnabCategoryForBudget = {
  id: string;
  name: string;
  goal_type: string | null;
  goal_target?: number | null;
  goal_cadence?: number | null;
  goal_cadence_frequency?: number | null;
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
        id: "refund",
        name: "Refund",
        goal_type: "NEED",
        assigned_history: [-9_000, 0, 3_000],
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
      {
        categoryId: "refund",
        categoryName: "Refund",
        amount: 0,
      },
    ]);
  });

  it("skips categories whose target asks for nothing", () => {
    const budget = computeMonthlyBudget({
      categories: [
        {
          id: "food",
          name: "Food",
          goal_type: "NEED",
          goal_target: 70_000,
          assigned_history: [70_000],
          hidden: false,
          deleted: false,
        },
        {
          id: "leftover",
          name: "Vacation (2026-12)",
          goal_type: "NEED",
          goal_target: 0,
          assigned_history: [300_000],
          hidden: false,
          deleted: false,
        },
      ],
      activeGoalCategoryIds: [],
      plannedIncome: 508_000,
    });

    expect(budget.obligations).toBe(70_000);
    expect(budget.obligationBreakdown.map((item) => item.categoryId)).toEqual([
      "food",
    ]);
  });

  it("caps average history at the monthly equivalent of the target", () => {
    const category = (
      id: string,
      history: number[],
      target: number,
      cadence: number,
      frequency = 1,
    ) => ({
      id,
      name: id,
      goal_type: "NEED",
      goal_target: target,
      goal_cadence: cadence,
      goal_cadence_frequency: frequency,
      assigned_history: history,
      hidden: false,
      deleted: false,
    });
    const budget = computeMonthlyBudget({
      categories: [
        // One-off spike: 130 326 / 6 = 21 721, capped at the monthly 10 000.
        category("taxes", [130_326, 0, 0, 0, 0, 0], 10_000, 1),
        // Below target: history wins.
        category("food", [60_000, 70_000], 70_000, 1),
        // Yearly 12 000 → 1 000 a month.
        category("insurance", [8_000], 12_000, 13),
        // Every 3 months (cadence 4) 9 000 → 3 000 a month.
        category("water", [9_000, 0, 0], 9_000, 4),
        // No repeating target: history as is.
        { ...category("fund", [5_000], 100_000, 0), goal_type: "TB" },
      ],
      activeGoalCategoryIds: [],
      plannedIncome: 100_000,
    });

    expect(
      Object.fromEntries(
        budget.obligationBreakdown.map((item) => [
          item.categoryId,
          item.amount,
        ]),
      ),
    ).toEqual({
      taxes: 10_000,
      food: 65_000,
      insurance: 1_000,
      water: 3_000,
      fund: 5_000,
    });
  });
});
