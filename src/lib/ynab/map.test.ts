import { describe, expect, it } from "vitest";

import { mapCategoryPriorMonthAvailable, mapReadyToAssign } from "./map";

describe("mapReadyToAssign", () => {
  it("reads the requested month instead of the first response", () => {
    expect(
      mapReadyToAssign(
        [
          { month: "2026-11-01", readyToAssign: 900_000 },
          { month: "2026-10-01", readyToAssign: 395_800_000 },
        ],
        "2026-10-01",
      ),
    ).toBe(395_800_000);
  });

  it("uses zero for a missing or negative Ready to Assign", () => {
    expect(mapReadyToAssign([], "2026-10-01")).toBe(0);
    expect(
      mapReadyToAssign(
        [{ month: "2026-10-01", readyToAssign: -100 }],
        "2026-10-01",
      ),
    ).toBe(0);
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
