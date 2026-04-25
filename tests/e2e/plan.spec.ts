import { expect, test } from "@playwright/test";

type PlanCalculateResponse = {
  budget: {
    plannedIncome: number;
    obligations: number;
    available: number;
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

const buildConnectState = (): PlanCalculateResponse => ({
  budget: {
    plannedIncome: 0,
    obligations: 0,
    available: 0,
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
  budget: {
    plannedIncome: 5000,
    obligations: 1200,
    available: 3800,
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
  budget: {
    plannedIncome: 6000,
    obligations: 1500,
    available: 4500,
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
    await expect(page.getByRole("link", { name: "Go to settings" })).toBeVisible();
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
    await expect(page.getByText("No goals yet")).toBeVisible();
    await expect(page.getByRole("link", { name: "Go to goals" })).toBeVisible();
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
    await expect(page.getByRole("columnheader", { name: "vacation" })).toBeVisible();
    await expect(page.getByText("Conflicts and warnings")).toBeVisible();
    await expect(page.getByText(/Unreachable goal: vacation/)).toBeVisible();
    await expect(page.getByText(/Tied deadline conflict/)).toBeVisible();
  });

  test("push preview dialog opens and shows diff rows", async ({ page }) => {
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
              { categoryId: "cat-vacation", current: 50000, next: 120000 },
              { categoryId: "cat-emergency", current: 75000, next: 100000 },
            ],
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: JSON_CONTENT_TYPE,
        body: JSON.stringify({ applied: 2 }),
      });
    });

    await page.goto(PLAN_PATH);

    await page.getByRole("button", { name: "Push goals to YNAB for current month" }).click();

    const dialog = page.getByRole("dialog", { name: "YNAB push confirmation" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("cat-vacation")).toBeVisible();
    await expect(dialog.getByText("cat-emergency")).toBeVisible();
    await expect(dialog.getByText("Current target")).toBeVisible();
    await expect(dialog.getByText("Next target")).toBeVisible();
  });
});
