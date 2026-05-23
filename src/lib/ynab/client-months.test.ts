import { afterEach, describe, expect, it, vi } from "vitest";

import {
  countMonthDetailCalls,
  createYnabMonthsFetchMock,
} from "@/lib/ynab/test/months-fetch-mock";

import { createYnabClient } from "./client";

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
          { month: "2024-03-01", income: 3_000_000 },
        ],
        detailMonthMatcher: (url) => url.endsWith("/months/2024-03-01"),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = createYnabClient("token");
    const months = await client.getMonths("budget-1", {
      monthDetailsLookback: 1,
    });

    expect(months).toEqual([
      {
        month: "2024-03-01",
        income: 3_000_000,
        categories: [{ id: "cat-1", budgeted: 100, activity: -50 }],
      },
      {
        month: "2024-02-01",
        income: 2_000_000,
        categories: undefined,
      },
      {
        month: "2024-01-01",
        income: 1_000_000,
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

    const client = createYnabClient("token");
    await client.getMonths("budget-1", { monthDetailsLookback: 3 });

    expect(countMonthDetailCalls(fetchMock)).toBe(3);
  });
});
