import { expect, test } from "@playwright/test";

type PlanCalculateResponse = {
  goals: Array<{
    id: string;
    name: string;
    targetAmount: number;
    currentBalance: number;
    savedProgress: number;
    availableBalance: number;
    deadline: string;
    status: "active" | "frozen" | "completed";
    ynabCategoryId: string | null;
    createdAt: string;
  }>;
  startMonth: string;
  horizonMonths: number;
  currencyCode: string;
  budget: {
    plannedIncome: number;
    obligations: number;
    available: number;
    obligationBreakdown: Array<{
      categoryId: string;
      categoryName: string;
      amount: number;
    }>;
  };
  planResult: {
    allocations: Array<{
      month: string;
      perGoal: Record<string, number>;
      unallocated: number;
    }>;
    conflicts: Array<
      | {
          type: "unreachable";
          goalId: string;
          earliestAchievable: string | null;
          detail: string;
        }
      | {
          type: "tied_deadline";
          goalIds: string[];
          deadline: string;
          detail: string;
        }
    >;
    completionMap: Record<string, string | null>;
    autoFrozenGoalIds: string[];
  };
  tbdWarnings: Array<{
    categoryId: string;
    categoryName: string;
  }>;
  needsSync: boolean;
};

const PLAN_PATH = "/plan";
const AUTH_BYPASS_HEADERS = { "x-e2e-auth": "1" };
const JSON_CONTENT_TYPE = "application/json";
const PLAN_CALCULATE_API_PATTERN = "**/api/plan/calculate";
const PLAN_PUSH_API_PATTERN = "**/api/plan/push";
const DEFAULT_START_MONTH = "2026-05-01T00:00:00.000Z";
const DEFAULT_HORIZON_MONTHS = 24;
const DEFAULT_CURRENCY = "RUB";
const VACATION_CATEGORY_ID = "cat-vacation";
const EMERGENCY_CATEGORY_ID = "cat-emergency";

const buildConnectState = (): PlanCalculateResponse => ({
  goals: [],
  startMonth: DEFAULT_START_MONTH,
  horizonMonths: DEFAULT_HORIZON_MONTHS,
  currencyCode: DEFAULT_CURRENCY,
  budget: {
    plannedIncome: 0,
    obligations: 0,
    available: 0,
    obligationBreakdown: [],
  },
  planResult: {
    allocations: [],
    conflicts: [],
    completionMap: {},
    autoFrozenGoalIds: [],
  },
  tbdWarnings: [],
  needsSync: true,
});

const buildEmptyGoalsState = (): PlanCalculateResponse => ({
  goals: [],
  startMonth: DEFAULT_START_MONTH,
  horizonMonths: DEFAULT_HORIZON_MONTHS,
  currencyCode: DEFAULT_CURRENCY,
  budget: {
    plannedIncome: 5000,
    obligations: 1200,
    available: 3800,
    obligationBreakdown: [],
  },
  planResult: {
    allocations: [],
    conflicts: [],
    completionMap: {},
    autoFrozenGoalIds: [],
  },
  tbdWarnings: [],
  needsSync: false,
});

const buildCalculatedState = (): PlanCalculateResponse => ({
  goals: [
    {
      id: "vacation",
      name: "Vacation",
      targetAmount: 300000,
      currentBalance: 100000,
      savedProgress: 100000,
      availableBalance: 100000,
      deadline: "2026-08-01",
      status: "active",
      ynabCategoryId: VACATION_CATEGORY_ID,
      createdAt: "2026-01-10T00:00:00.000Z",
    },
    {
      id: "emergency",
      name: "Emergency",
      targetAmount: 400000,
      currentBalance: 250000,
      savedProgress: 250000,
      availableBalance: 250000,
      deadline: "2026-08-01",
      status: "active",
      ynabCategoryId: EMERGENCY_CATEGORY_ID,
      createdAt: "2026-01-15T00:00:00.000Z",
    },
  ],
  startMonth: DEFAULT_START_MONTH,
  horizonMonths: DEFAULT_HORIZON_MONTHS,
  currencyCode: DEFAULT_CURRENCY,
  budget: {
    plannedIncome: 6000,
    obligations: 1500,
    available: 4500,
    obligationBreakdown: [],
  },
  planResult: {
    allocations: [
      {
        month: "2026-05-01T00:00:00.000Z",
        perGoal: {
          vacation: 1000,
          emergency: 1500,
        },
        unallocated: 2000,
      },
    ],
    conflicts: [
      {
        type: "unreachable",
        goalId: "vacation",
        earliestAchievable: "2026-09-01T00:00:00.000Z",
        detail: "Income is insufficient to hit target month.",
      },
      {
        type: "tied_deadline",
        goalIds: ["vacation", "emergency"],
        deadline: "2026-08-01T00:00:00.000Z",
        detail: "Consider moving one deadline by at least one month.",
      },
    ],
    completionMap: {
      vacation: null,
      emergency: "2026-07-01T00:00:00.000Z",
    },
    autoFrozenGoalIds: [],
  },
  tbdWarnings: [
    {
      categoryId: "cat-tbd",
      categoryName: "TBD Buffer",
    },
  ],
  needsSync: false,
});

test("plan redirects to /login when unauthenticated", async ({ page }) => {
  await page.goto(PLAN_PATH);

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
});

test.describe("plan page states with e2e auth bypass", () => {
  test.use({
    extraHTTPHeaders: AUTH_BYPASS_HEADERS,
  });

  for (const syncStatus of ["synced", "error"] as const) {
    test(`creating a goal reports target sync ${syncStatus} without applying Push`, async ({
      page,
    }) => {
      let pushRequests = 0;
      await page.route(PLAN_CALCULATE_API_PATTERN, (route) =>
        route.fulfill({
          json: buildCalculatedState(),
        }),
      );
      await page.route("**/api/goals", (route) =>
        route.fulfill({
          json:
            route.request().method() === "POST"
              ? {
                  goal: {
                    id: "vacation",
                    name: "Vacation",
                    deadline: "2026-12-01",
                    status: "active",
                  },
                  sync: {
                    status: syncStatus,
                    message:
                      syncStatus === "error"
                        ? "YNAB is unavailable."
                        : undefined,
                  },
                }
              : { goals: [] },
        }),
      );
      await page.route(PLAN_PUSH_API_PATTERN, (route) => {
        pushRequests++;
        return route.fulfill({
          status: 500,
          json: { error: "Unexpected Push" },
        });
      });
      await page.goto(PLAN_PATH);
      await page
        .getByRole("button", { name: "Create goal", exact: true })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "Create goal",
        exact: true,
      });
      await dialog.getByLabel("Name", { exact: true }).fill("Vacation");
      await dialog.getByLabel("Target amount").fill("300000");
      await dialog.getByLabel("Deadline").fill("2026-12-01");
      await dialog
        .getByRole("button", { name: "Create goal", exact: true })
        .click();

      await expect(dialog).not.toBeVisible();
      const toast = page.locator("[data-sonner-toast]");
      await expect(toast).toContainText(
        syncStatus === "synced"
          ? "Monthly targets updated. Use Push to YNAB to redistribute assigned money."
          : "Goal created, YNAB update failed",
      );
      if (syncStatus === "error")
        await expect(toast).toContainText("YNAB is unavailable.");
      expect(pushRequests).toBe(0);
    });
  }

  test("plan renders YNAB connect state", async ({ page }) => {
    await page.route(PLAN_CALCULATE_API_PATTERN, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: JSON_CONTENT_TYPE,
        body: JSON.stringify(buildConnectState()),
      });
    });

    await page.goto(PLAN_PATH);

    await expect(page).toHaveURL(/\/plan$/);
    await expect(page.getByText("Connect YNAB first")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Go to settings" }),
    ).toBeVisible();
  });

  test("plan renders empty goals state", async ({ page }) => {
    await page.route(PLAN_CALCULATE_API_PATTERN, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: JSON_CONTENT_TYPE,
        body: JSON.stringify(buildEmptyGoalsState()),
      });
    });

    await page.goto(PLAN_PATH);

    await expect(page).toHaveURL(/\/plan$/);
    await expect(page.getByText("Plan overview")).toBeVisible();
    await expect(page.getByText("No goals to display.")).toBeVisible();
  });
});

test.describe("plan calculated and push preview with e2e auth bypass", () => {
  test.use({
    extraHTTPHeaders: AUTH_BYPASS_HEADERS,
  });

  test("plan renders calculated table and conflicts", async ({ page }) => {
    await page.route(PLAN_CALCULATE_API_PATTERN, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: JSON_CONTENT_TYPE,
        body: JSON.stringify(buildCalculatedState()),
      });
    });

    await page.goto(PLAN_PATH);

    await expect(page).toHaveURL(/\/plan$/);
    await expect(page.getByText("Monthly allocation")).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: /vacation/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Apply earliest reachable date for Vacation",
      }),
    ).toBeVisible();
    await expect(page.getByText("Conflicts and warnings")).toBeVisible();
    await expect(page.getByText(/Unreachable goal: vacation/)).toBeVisible();
    await expect(page.getByText(/Tied deadline conflict/)).toBeVisible();
  });

  test("push preview separates RTA and applies only after confirmation", async ({
    page,
  }) => {
    await page.route(PLAN_CALCULATE_API_PATTERN, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(buildCalculatedState()),
      });
    });
    await page.route(PLAN_PUSH_API_PATTERN, async (route) => {
      const request = route.request();
      const payload = request.postDataJSON() as { mode?: string };

      if (payload.mode === "preview") {
        await route.fulfill({
          status: 200,
          contentType: JSON_CONTENT_TYPE,
          body: JSON.stringify({
            diffHash: "preview-hash-1",
            diff: [
              {
                categoryId: VACATION_CATEGORY_ID,
                categoryName: "Vacation",
                current: 50000,
                next: 120000,
              },
              ...Array.from({ length: 20 }, (_, index) => ({
                categoryId: `cat-target-${index}`,
                categoryName: `Target ${index}`,
                current: 0,
                next: 1000,
              })),
            ],
            assignedMoves: [
              {
                categoryId: EMERGENCY_CATEGORY_ID,
                categoryName: "Emergency",
                current: 75_000_000,
                next: 100_000_000,
              },
              ...Array.from({ length: 20 }, (_, index) => ({
                categoryId: `cat-rebalance-${index}`,
                categoryName: `Rebalance ${index}`,
                current: 0,
                next: 1000,
              })),
            ],
            readyToAssignMoves: [
              {
                categoryId: "cat-buffer",
                categoryName: "Buffer",
                current: 0,
                next: 100_000_000,
              },
              ...Array.from({ length: 20 }, (_, index) => ({
                categoryId: `cat-rta-${index}`,
                categoryName: `RTA ${index}`,
                current: 0,
                next: 1000,
              })),
            ],
            readyToAssign: {
              available: 395_800_000,
              remaining: 295_800_000,
            },
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: JSON_CONTENT_TYPE,
        body: JSON.stringify({ applied: 3 }),
      });
    });

    await page.setViewportSize({ width: 800, height: 500 });
    await page.goto(PLAN_PATH);

    await page
      .getByRole("button", { name: "Push goals to YNAB for current month" })
      .click();

    const dialog = page.getByRole("dialog", { name: "YNAB push confirmation" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("cat-vacation")).toBeVisible();
    await expect(dialog.getByText("cat-emergency")).toBeVisible();
    await expect(dialog.getByText("cat-buffer")).toBeVisible();
    await expect(dialog.getByText("Current target")).toBeVisible();
    await expect(dialog.getByText("Next target")).toBeVisible();
    await expect(dialog.getByText(/^Ready to Assign:/)).toContainText("395");
    await expect(dialog.getByText(/Assigning to goals:/)).toContainText("100");
    await expect(dialog.getByText(/Remaining Ready to Assign:/)).toContainText(
      "295",
    );

    await dialog
      .getByRole("button", { name: "Apply YNAB push changes" })
      .click();
    await expect(dialog).not.toBeVisible();
    await expect(page.locator("[data-sonner-toast]")).toContainText(
      "Push completed",
    );
  });

  test("push preview shows an empty state and disables apply", async ({
    page,
  }) => {
    await page.route(PLAN_CALCULATE_API_PATTERN, (route) =>
      route.fulfill({ json: buildCalculatedState() }),
    );
    await page.route(PLAN_PUSH_API_PATTERN, (route) =>
      route.fulfill({
        json: {
          diffHash: "empty-hash",
          diff: [],
          assignedMoves: [],
          readyToAssignMoves: [],
          readyToAssign: { available: 0, remaining: 0 },
        },
      }),
    );

    await page.goto(PLAN_PATH);
    await page
      .getByRole("button", { name: "Push goals to YNAB for current month" })
      .click();

    const dialog = page.getByRole("dialog", { name: "YNAB push confirmation" });
    await expect(dialog.getByText("No changes to apply")).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Apply YNAB push changes" }),
    ).toBeDisabled();
  });
});
