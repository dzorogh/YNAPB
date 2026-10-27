import { expect, it, vi } from "vitest";

import { buildPushDiff, pushAssignedMoves } from "./push-mf";

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
  categories?: Array<{
    id: string;
    name: string;
    goalTarget: number | null;
    goalTargetMonth?: string | null;
  }>;
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

it("includes categories with a YNAB target date to clear it", () => {
  const result = buildPushDiff(
    buildInput({
      goals: [{ id: GOAL_ONE, status: ACTIVE, ynabCategoryId: CAT_ONE }],
      allocationForMonth: { [GOAL_ONE]: 100 },
      categories: [
        {
          id: CAT_ONE,
          name: "Category One",
          goalTarget: 100,
          goalTargetMonth: "2027-08-01",
        },
      ],
    }),
  );

  expect(result).toEqual([
    {
      categoryId: CAT_ONE,
      categoryName: "Category One",
      current: 100_000,
      next: 100_000,
      clearsTargetDate: true,
    },
  ]);
});

it("runs recovery after each successful absolute assigned write", async () => {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL) =>
    Response.json({ data: { category: { id: "cat" } } }),
  );
  const onMoveApplied = vi.fn(async () => {});
  const decrease = {
    categoryId: "decrease",
    categoryName: "Decrease",
    current: 100,
    next: 0,
  };
  const increase = {
    categoryId: "increase",
    categoryName: "Increase",
    current: 0,
    next: 100,
  };

  await pushAssignedMoves({
    token: "token",
    budgetId: "budget",
    month: "2026-10",
    moves: [increase, decrease],
    onMoveApplied,
    fetchImpl: fetchMock,
  });

  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
    "/categories/decrease",
  );
  expect(onMoveApplied.mock.calls).toEqual([[decrease], [increase]]);
});
