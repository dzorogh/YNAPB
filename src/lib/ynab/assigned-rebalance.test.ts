import { describe, expect, it } from "vitest";

import { rebalanceAssignedToTargets } from "./assigned-rebalance";

describe("rebalanceAssignedToTargets", () => {
  it("moves surplus above plan into goals short of target", () => {
    const result = rebalanceAssignedToTargets([
      {
        categoryId: "siding",
        assigned: 700_000,
        planned: 71_429,
        target: 700_000,
      },
      { categoryId: "dentist", assigned: 0, planned: 62_500, target: 62_500 },
      { categoryId: "move", assigned: 0, planned: 185_573, target: 185_573 },
    ]);

    expect(Object.fromEntries(result)).toEqual({
      siding: 451_927,
      dentist: 62_500,
      move: 185_573,
    });
  });

  it("fills earliest-deadline deficits first when surplus is short", () => {
    const result = rebalanceAssignedToTargets([
      { categoryId: "first", assigned: 0, planned: 50, target: 50 },
      { categoryId: "second", assigned: 0, planned: 50, target: 50 },
      { categoryId: "rich", assigned: 130, planned: 60, target: 130 },
    ]);

    expect(Object.fromEntries(result)).toEqual({
      first: 50,
      second: 20,
      rich: 60,
    });
  });

  it("takes surplus from the latest-deadline goal first", () => {
    const result = rebalanceAssignedToTargets([
      { categoryId: "early", assigned: 100, planned: 50, target: 100 },
      { categoryId: "short", assigned: 0, planned: 30, target: 30 },
      { categoryId: "late", assigned: 100, planned: 50, target: 100 },
    ]);

    expect(Object.fromEntries(result)).toEqual({
      early: 100,
      short: 30,
      late: 70,
    });
  });

  it("does not rebalance into a category with negative assigned", () => {
    const result = rebalanceAssignedToTargets([
      { categoryId: "negative", assigned: -50, planned: 100, target: 100 },
      { categoryId: "rich", assigned: 100, planned: 0, target: 100 },
    ]);

    expect(Object.fromEntries(result)).toEqual({ negative: -50, rich: 100 });
  });

  it("excludes overspent categories as sources and recipients", () => {
    const result = rebalanceAssignedToTargets([
      { categoryId: "early", assigned: 0, planned: 50, target: 50 },
      {
        categoryId: "overspent",
        assigned: 100,
        balance: -1,
        planned: 0,
        target: 100,
      },
      { categoryId: "rich", assigned: 100, planned: 0, target: 100 },
    ]);

    expect(Object.fromEntries(result)).toEqual({
      early: 50,
      overspent: 100,
      rich: 50,
    });
  });

  it("keeps assigned when nothing is short", () => {
    const result = rebalanceAssignedToTargets([
      { categoryId: "a", assigned: 100, planned: 50, target: 100 },
      { categoryId: "b", assigned: 30, planned: 30, target: 30 },
    ]);

    expect(Object.fromEntries(result)).toEqual({ a: 100, b: 30 });
  });
});
