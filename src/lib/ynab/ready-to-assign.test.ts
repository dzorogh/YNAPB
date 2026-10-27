import { describe, expect, it } from "vitest";

import { allocateReadyToAssign } from "./ready-to-assign";

const goal = (categoryId: string, assigned: number, target: number) => ({
  categoryId,
  assigned,
  planned: target,
  target,
});

describe("allocateReadyToAssign", () => {
  it("allocates milliunits up to Ready to Assign in priority order", () => {
    const result = allocateReadyToAssign(
      [goal("first", 0, 200_000), goal("second", 50_000, 300_000)],
      395_800,
    );

    expect(Object.fromEntries(result)).toEqual({
      first: 200_000,
      second: 245_800,
    });
  });

  it("assigns only the deficit and leaves excess Ready to Assign untouched", () => {
    const result = allocateReadyToAssign(
      [goal("first", 25_000, 100_000)],
      395_800,
    );

    expect(result.get("first")).toBe(100_000);
  });

  it("returns no new assignments for unavailable Ready to Assign", () => {
    for (const readyToAssign of [0, -1]) {
      const result = allocateReadyToAssign(
        [goal("first", 0, 100)],
        readyToAssign,
      );
      expect(result.get("first")).toBe(0);
    }
  });

  it("does not fund a category with negative assigned", () => {
    const result = allocateReadyToAssign(
      [goal("negative", -50, 100), goal("next", 0, 100)],
      100,
    );

    expect(Object.fromEntries(result)).toEqual({ negative: -50, next: 100 });
  });

  it("does not fund an overspent category", () => {
    const result = allocateReadyToAssign(
      [{ ...goal("overspent", 0, 100), balance: -1 }, goal("next", 0, 100)],
      100,
    );

    expect(Object.fromEntries(result)).toEqual({ overspent: 0, next: 100 });
  });

  it("is idempotent after applying the returned assigned amounts", () => {
    const goals = [goal("first", 0, 100), goal("second", 0, 100)];
    const allocated = allocateReadyToAssign(goals, 150);
    const applied = goals.map((item) => ({
      ...item,
      assigned: allocated.get(item.categoryId)!,
    }));

    expect(allocateReadyToAssign(applied, 0)).toEqual(allocated);
  });
});
