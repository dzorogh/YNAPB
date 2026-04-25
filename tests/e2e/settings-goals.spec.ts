import { test, expect } from "@playwright/test";

test("settings redirects to /login when unauthenticated", async ({ page }) => {
  await page.goto("/settings");

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
});

test.describe("settings and goals smoke with e2e auth bypass", () => {
  test.use({
    extraHTTPHeaders: {
      "x-e2e-auth": "1",
    },
  });

  test("settings page renders", async ({ page }) => {
    await page.goto("/settings");

    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByText(/connect your ynab budget/i)).toBeVisible();
  });

  test("goals page renders empty state", async ({ page }) => {
    await page.route("**/api/goals", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ goals: [] }),
      });
    });

    await page.goto("/goals");

    await expect(page).toHaveURL(/\/goals$/);
    await expect(page.getByRole("heading", { name: "Goals" })).toBeVisible();
    await expect(page.getByText("No goals yet")).toBeVisible();
    await expect(page.getByText(/create your first goal/i)).toBeVisible();
  });
});
