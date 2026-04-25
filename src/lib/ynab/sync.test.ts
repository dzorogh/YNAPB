import { describe, expect, it } from "vitest";
import { syncYnabData, type YnabDataClient } from "./sync";

const buildClient = (): YnabDataClient => ({
  getCategories: () =>
    Promise.resolve([
      {
        id: "cat-rent",
        name: "Rent",
        goal_type: "TB",
        goal_target: 120_000,
        goal_under_funded: 30_000,
      },
      {
        id: "cat-fun",
        name: "Fun",
        goal_type: null,
        goal_target: null,
        goal_under_funded: null,
      },
    ]),
  getMonths: () =>
    Promise.resolve([
      { month: "2026-01-01", income: 100_000 },
      { month: "2026-02-01", income: 150_000 },
      { month: "2026-03-01", income: 200_000 },
      { month: "2026-04-01", income: 250_000 },
    ]),
});

describe("syncYnabData", () => {
  it("throws typed error when token is missing", async () => {
    await expect(
      syncYnabData({
        token: "",
        budgetId: "budget-1",
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
      token: "ynab-token",
      budgetId: "budget-1",
      baselineMonths: 2,
      client: buildClient(),
    });

    expect(result.categories).toEqual([
      {
        id: "cat-rent",
        name: "Rent",
        goal_type: "TB",
        goal_target: 120_000,
        goal_under_funded: 30_000,
      },
      {
        id: "cat-fun",
        name: "Fun",
        goal_type: null,
        goal_target: null,
        goal_under_funded: null,
      },
    ]);
  });

  it("returns income history from latest N months", async () => {
    const result = await syncYnabData({
      token: "ynab-token",
      budgetId: "budget-1",
      baselineMonths: 2,
      client: buildClient(),
    });

    expect(result.incomeHistory).toEqual([
      { month: "2026-04-01", income: 250_000 },
      { month: "2026-03-01", income: 200_000 },
    ]);
  });
});
