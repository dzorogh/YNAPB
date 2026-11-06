import { afterEach, describe, expect, it, vi } from "vitest";

import {
  countMonthDetailCalls,
  createYnabMonthsFetchMock,
} from "@/lib/ynab/test/months-fetch-mock";

import { createYnabClient } from "./client";

const currentMonth = vi.hoisted(() => ({ value: "2024-12-01" }));
vi.mock("@/lib/ynab/map", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ynab/map")>()),
  currentBudgetMonthFromDate: () => currentMonth.value,
}));

describe("createYnabClient.getMonths", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns income for every listed month but fetches details only for lookback", async () => {
    const fetchMock = vi.fn(
      createYnabMonthsFetchMock({
        months: [
          { month: "2024-01-01", income: 1_000_000 },
          { month: "2024-02-01", income: 2_000_000 },
          {
            month: "2024-03-01",
            income: 3_000_000,
            to_be_budgeted: 395_800_000,
          },
        ],
        detailMonthMatcher: (url) => url.endsWith("/months/2024-03-01"),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    currentMonth.value = "2024-12-01";

    const client = createYnabClient("token");
    const months = await client.getMonths("budget-1", {
      monthDetailsLookback: 1,
    });

    expect(months).toEqual([
      {
        month: "2024-03-01",
        income: 3_000_000,
        readyToAssign: 395_800_000,
        categories: [{ id: "cat-1", budgeted: 100, activity: -50 }],
      },
      {
        month: "2024-02-01",
        income: 2_000_000,
        readyToAssign: undefined,
        categories: undefined,
      },
      {
        month: "2024-01-01",
        income: 1_000_000,
        readyToAssign: undefined,
        categories: undefined,
      },
    ]);

    expect(
      countMonthDetailCalls(fetchMock, (url) => url.includes("/months/2024-")),
    ).toBe(1);
  });

  it("fetches three month details when lookback is three", async () => {
    const fetchMock = vi.fn(
      createYnabMonthsFetchMock({
        months: [
          { month: "2024-01-01", income: 1_000_000 },
          { month: "2024-02-01", income: 2_000_000 },
          { month: "2024-03-01", income: 3_000_000 },
          { month: "2024-04-01", income: 4_000_000 },
          { month: "2024-05-01", income: 5_000_000 },
          { month: "2024-06-01", income: 6_000_000 },
        ],
        detailCategories: [{ id: "cat-1", budgeted: 100, activity: -10 }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    currentMonth.value = "2024-12-01";
    const client = createYnabClient("token");
    await client.getMonths("budget-1", { monthDetailsLookback: 3 });

    expect(countMonthDetailCalls(fetchMock)).toBe(3);
  });

  it("fetches details only for completed months, skipping current and future", async () => {
    const fetchMock = vi.fn(
      createYnabMonthsFetchMock({
        months: [
          { month: "2026-09-01", income: 1_000_000 },
          { month: "2026-10-01", income: 2_000_000 },
          { month: "2026-11-01", income: 3_000_000 },
          { month: "2026-12-01", income: 0 },
          { month: "2027-01-01", income: 0 },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    currentMonth.value = "2026-11-01";

    const months = await createYnabClient("token").getMonths("budget-1", {
      monthDetailsLookback: 3,
    });

    expect(
      months.filter((month) => month.categories).map((month) => month.month),
    ).toEqual(["2026-10-01", "2026-09-01"]);
  });
});

describe("createYnabClient.getCategorySpending", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("nets refunds against spending and skips deleted transactions", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain("/categories/cat-goal/transactions");
      expect(url).toContain("since_date=2026-04-25");
      expect(url).toContain("until_date=2026-10-31");
      const transaction = (id: string, amount: number, deleted = false) => ({
        id,
        date: "2026-06-01",
        amount,
        cleared: "cleared",
        approved: true,
        account_id: "acc",
        account_name: "Card",
        deleted,
        type: "transaction",
        subtransactions: [],
      });
      return new Response(
        JSON.stringify({
          data: {
            transactions: [
              transaction("pay", -150_000_000),
              transaction("refund", 30_000_000),
              transaction("gone", -999_000_000, true),
            ],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const spent = await createYnabClient("token").getCategorySpending(
      "budget-1",
      "cat-goal",
      { sinceDate: "2026-04-25", untilDate: "2026-10-31" },
    );

    expect(spent).toBe(120_000_000);
  });
});
