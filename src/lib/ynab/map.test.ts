import { describe, expect, it } from "vitest";

import {
  mapCategoryCashSpentTotal,
  mapCategoryPriorMonthAvailable,
} from "./map";

describe("mapCategoryCashSpentTotal", () => {
  it("sums cash spending across all synced months per category", () => {
    const spent = mapCategoryCashSpentTotal([
      {
        month: "2026-05-01",
        categories: [
          { id: "gazebo", activity: -166_000_000 },
          { id: "other", activity: 500_000 },
        ],
      },
      {
        month: "2026-04-01",
        categories: [{ id: "gazebo", activity: -20_000_000 }],
      },
    ]);

    expect(spent.get("gazebo")).toBe(186_000);
    expect(spent.get("other")).toBeUndefined();
  });
});

describe("mapCategoryPriorMonthAvailable", () => {
  it("reads ending available from the prior budget month", () => {
    const prior = mapCategoryPriorMonthAvailable([
      {
        month: "2026-05-01",
        categories: [{ id: "gazebo", balance: 36_656_000 }],
      },
      {
        month: "2026-04-01",
        categories: [{ id: "gazebo", balance: 28_125_000 }],
      },
    ]);

    expect(prior.get("gazebo")).toBe(28_125);
  });

  it("uses April carryover for May when June is already open (Беседка)", () => {
    const prior = mapCategoryPriorMonthAvailable(
      [
        {
          month: "2026-06-01",
          categories: [{ id: "gazebo", balance: 0 }],
        },
        {
          month: "2026-05-01",
          categories: [{ id: "gazebo", balance: 54_000_000 }],
        },
        {
          month: "2026-04-01",
          categories: [{ id: "gazebo", balance: 28_125_000 }],
        },
      ],
      "2026-05-01",
    );

    expect(prior.get("gazebo")).toBe(28_125);
  });
});
