import { afterEach, describe, expect, it, vi } from "vitest";

import { createYnabClient } from "./client";

describe("createYnabClient.getMonths", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns income for every listed month but fetches details only for lookback", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url.endsWith("/months")) {
        return new Response(
          JSON.stringify({
            data: {
              months: [
                { month: "2024-01-01", income: 1_000_000 },
                { month: "2024-02-01", income: 2_000_000 },
                { month: "2024-03-01", income: 3_000_000 },
              ],
            },
          }),
          { status: 200 },
        );
      }

      if (url.endsWith("/months/2024-03-01")) {
        return new Response(
          JSON.stringify({
            data: {
              month: {
                month: "2024-03-01",
                categories: [{ id: "cat-1", budgeted: 100, activity: -50 }],
              },
            },
          }),
          { status: 200 },
        );
      }

      return new Response("not found", { status: 404 });
    });
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

    const monthDetailCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/months/2024-"),
    );
    expect(monthDetailCalls).toHaveLength(1);
  });

  it("fetches three month details when lookback is three", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url.endsWith("/months")) {
        return new Response(
          JSON.stringify({
            data: {
              months: [
                { month: "2024-01-01", income: 1_000_000 },
                { month: "2024-02-01", income: 2_000_000 },
                { month: "2024-03-01", income: 3_000_000 },
                { month: "2024-04-01", income: 4_000_000 },
                { month: "2024-05-01", income: 5_000_000 },
                { month: "2024-06-01", income: 6_000_000 },
              ],
            },
          }),
          { status: 200 },
        );
      }

      if (url.includes("/months/2024-0")) {
        return new Response(
          JSON.stringify({
            data: {
              month: {
                month: url.split("/").at(-1),
                categories: [{ id: "cat-1", budgeted: 100, activity: -10 }],
              },
            },
          }),
          { status: 200 },
        );
      }

      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createYnabClient("token");
    await client.getMonths("budget-1", { monthDetailsLookback: 3 });

    const monthDetailCalls = fetchMock.mock.calls.filter(([url]) =>
      /\/months\/\d{4}-\d{2}-\d{2}$/.test(String(url)),
    );
    expect(monthDetailCalls).toHaveLength(3);
  });
});
