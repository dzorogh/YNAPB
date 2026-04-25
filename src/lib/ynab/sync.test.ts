import { describe, expect, it } from "vitest";

import { syncYnabData, type YnabDataClient } from "./sync";

const BASELINE_MONTHS = 2;
const TEST_TOKEN = "ynab-token";
const TEST_BUDGET_ID = "budget-1";

const buildClient = (): YnabDataClient => ({
  getCategories: () =>
    Promise.resolve([
      {
        id: "cat-rent",
        name: "Rent",
        goal_type: "TB",
        goal_cadence: 0,
        goal_target: 120_000_000,
        goal_target_month: "2026-12-01",
        goal_under_funded: 30_000_000,
      },
      {
        id: "cat-fun",
        name: "Fun",
        goal_type: null,
        goal_cadence: null,
        goal_target: null,
        goal_target_month: null,
        goal_under_funded: null,
      },
    ]),
  getMonths: () =>
    Promise.resolve([
      {
        month: "2026-01-01",
        income: 100_000_000,
        categories: [
          { id: "cat-rent", budgeted: 10_000_000 },
          { id: "cat-fun", budgeted: 2_000_000 },
        ],
      },
      {
        month: "2026-02-01",
        income: 150_000_000,
        categories: [
          { id: "cat-rent", budgeted: 11_000_000 },
          { id: "cat-fun", budgeted: 3_000_000 },
        ],
      },
      {
        month: "2026-03-01",
        income: 200_000_000,
        categories: [
          { id: "cat-rent", budgeted: 12_000_000 },
          { id: "cat-fun", budgeted: 4_000_000 },
        ],
      },
      {
        month: "2026-04-01",
        income: 250_000_000,
        categories: [
          { id: "cat-rent", budgeted: 13_000_000 },
          { id: "cat-fun", budgeted: 5_000_000 },
        ],
      },
    ]),
  getBudgetCurrencyCode: () => Promise.resolve("EUR"),
});

describe("syncYnabData", () => {
  it("throws typed error when token is missing", async () => {
    await expect(
      syncYnabData({
        token: "",
        budgetId: TEST_BUDGET_ID,
        baselineMonths: 3,
        client: buildClient(),
      }),
    ).rejects.toMatchObject({
      code: "MISSING_TOKEN",
      message: "YNAB token is required",
    });
  });

  it("maps categories with goal_type, goal_target and goal_under_funded", async () => {
    const result = await syncYnabData({
      token: TEST_TOKEN,
      budgetId: TEST_BUDGET_ID,
      baselineMonths: BASELINE_MONTHS,
      client: buildClient(),
    });

    expect(result.categories).toEqual([
      {
        id: "cat-rent",
        name: "Rent",
        goal_type: "TB",
        goal_cadence: 0,
        goal_target: 120_000,
        goal_target_month: "2026-12-01",
        goal_under_funded: 30_000,
        balance: null,
        hidden: false,
        deleted: false,
        assigned_history: [13_000, 12_000, 11_000],
      },
      {
        id: "cat-fun",
        name: "Fun",
        goal_type: null,
        goal_cadence: null,
        goal_target: null,
        goal_target_month: null,
        goal_under_funded: null,
        balance: null,
        hidden: false,
        deleted: false,
        assigned_history: [5_000, 4_000, 3_000],
      },
    ]);
  });

  it("returns income history from latest N months", async () => {
    const result = await syncYnabData({
      token: TEST_TOKEN,
      budgetId: TEST_BUDGET_ID,
      baselineMonths: BASELINE_MONTHS,
      client: buildClient(),
    });

    expect(result.incomeHistory).toEqual([
      { month: "2026-04-01", income: 250_000 },
      { month: "2026-03-01", income: 200_000 },
    ]);
  });

  it("returns budget currency code", async () => {
    const result = await syncYnabData({
      token: TEST_TOKEN,
      budgetId: TEST_BUDGET_ID,
      baselineMonths: BASELINE_MONTHS,
      client: buildClient(),
    });

    expect(result.currencyCode).toBe("EUR");
  });
});
