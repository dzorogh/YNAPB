import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildPushDiff, pushImmediateMonthlyFundingGoal } from "./push-mf";

const ACTIVE = "active" as const;
const FROZEN = "frozen" as const;
const CAT_ONE = "cat-1";
const CAT_ACTIVE = "cat-active";
const GOAL_ONE = "goal-1";

const buildInput = (overrides?: {
  goals?: Array<{
    id: string;
    status: "active" | "frozen" | "completed";
    ynabCategoryId: string | null;
  }>;
  allocationForMonth?: Record<string, number>;
  categories?: Array<{ id: string; name: string; goalTarget: number | null }>;
}) => ({
  goals: overrides?.goals ?? [],
  allocationForMonth: overrides?.allocationForMonth ?? {},
  categories: overrides?.categories ?? [],
});

it("converts human currency to YNAB milliunits", () => {
  const result = buildPushDiff(
    buildInput({
      goals: [{ id: GOAL_ONE, status: ACTIVE, ynabCategoryId: CAT_ONE }],
      allocationForMonth: { [GOAL_ONE]: 123.45 },
      categories: [{ id: CAT_ONE, name: "Category One", goalTarget: 100 }],
    }),
  );

  expect(result).toEqual([
    {
      categoryId: CAT_ONE,
      categoryName: "Category One",
      current: 100_000,
      next: 123_450,
    },
  ]);
});

it("updates only active linked goals", () => {
  const result = buildPushDiff(
    buildInput({
      goals: [
        { id: "active-linked", status: ACTIVE, ynabCategoryId: CAT_ACTIVE },
        { id: "frozen-linked", status: FROZEN, ynabCategoryId: "cat-frozen" },
        { id: "active-unlinked", status: ACTIVE, ynabCategoryId: null },
      ],
      allocationForMonth: {
        "active-linked": 10,
        "frozen-linked": 20,
        "active-unlinked": 30,
      },
      categories: [
        { id: CAT_ACTIVE, name: "Active Cat", goalTarget: 0 },
        { id: "cat-frozen", name: "Frozen Cat", goalTarget: 0 },
      ],
    }),
  );

  expect(result).toEqual([
    {
      categoryId: CAT_ACTIVE,
      categoryName: "Active Cat",
      current: 0,
      next: 10_000,
    },
  ]);
});

it("prepares diff payload with current and next values", () => {
  const result = buildPushDiff(
    buildInput({
      goals: [{ id: GOAL_ONE, status: ACTIVE, ynabCategoryId: CAT_ONE }],
      allocationForMonth: { [GOAL_ONE]: 50 },
      categories: [{ id: CAT_ONE, name: "Category One", goalTarget: 40 }],
    }),
  );

  expect(result).toEqual([
    {
      categoryId: CAT_ONE,
      categoryName: "Category One",
      current: 40_000,
      next: 50_000,
    },
  ]);
});

it("skips unchanged categories", () => {
  const result = buildPushDiff(
    buildInput({
      goals: [{ id: GOAL_ONE, status: ACTIVE, ynabCategoryId: CAT_ONE }],
      allocationForMonth: { [GOAL_ONE]: 40 },
      categories: [{ id: CAT_ONE, name: "Category One", goalTarget: 40 }],
    }),
  );

  expect(result).toEqual([]);
});

describe("pushImmediateMonthlyFundingGoal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-10T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("raises goal_target to assigned when assigned exceeds calculated target", async () => {
    const patchCalls: unknown[] = [];
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PATCH") {
          patchCalls.push(JSON.parse(init.body as string));
          return new Response(JSON.stringify({ data: {} }), { status: 200 });
        }

        return new Response(
          JSON.stringify({
            data: {
              category: {
                name: "Новая машина (2027-07)",
                goal_target: 37_515_000,
                balance: 406_529_000,
                budgeted: 279_368_000,
                activity: 0,
              },
            },
          }),
          { status: 200 },
        );
      },
    );

    const result = await pushImmediateMonthlyFundingGoal({
      token: "token",
      budgetId: "budget",
      categoryId: "cat-car",
      targetAmount: 1_500_000,
      deadline: "2027-07-01",
      fetchImpl,
    });

    expect(result).toBe("updated");
    expect(patchCalls).toEqual([
      {
        category: {
          goal_target: 279_368_000,
        },
      },
    ]);
  });
});
