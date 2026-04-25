import { beforeEach, expect, it, vi } from "vitest";

import type { Tables } from "@/types/supabase";

import { createYnabClient } from "./client";
import { ensureGoalCategoryLink } from "./goal-category-link";

vi.mock("./client", () => ({
  createYnabClient: vi.fn(),
}));

const mockedCreateYnabClient = vi.mocked(createYnabClient);

const createGoal = (overrides?: Partial<Tables<"goals">>): Tables<"goals"> => ({
  id: "goal-1",
  user_id: "11111111-1111-1111-1111-111111111111",
  name: "Gazebo",
  target_amount: 1_000,
  deadline: "2026-08-01",
  ynab_category_id: null,
  status: "active",
  notes: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  last_sync_status: "synced",
  last_sync_error: null,
  last_synced_at: null,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

it("keeps linked category when name is already up to date", async () => {
  const goal = createGoal({ ynab_category_id: "cat-linked" });
  const client = {
    getCategoryGroups: vi
      .fn()
      .mockResolvedValue([{ id: "group-1", name: "Goals" }]),
    createCategoryGroup: vi.fn(),
    getCategories: vi.fn().mockResolvedValue([
      {
        id: "cat-linked",
        name: "Gazebo (2026-08)",
        category_group_id: "group-1",
        goal_type: null,
        goal_target: null,
        goal_under_funded: null,
      },
    ]),
    createCategory: vi.fn(),
    updateCategoryName: vi.fn(),
  };
  mockedCreateYnabClient.mockReturnValue(client as never);

  const categoryId = await ensureGoalCategoryLink({
    token: "token",
    budgetId: "budget",
    goal,
  });

  expect(categoryId).toBe("cat-linked");
  expect(client.updateCategoryName).not.toHaveBeenCalled();
});

it("renames linked category when goal name or deadline changed", async () => {
  const goal = createGoal({
    ynab_category_id: "cat-linked",
    name: "Patio",
    deadline: "2027-01-01",
  });
  const client = {
    getCategoryGroups: vi
      .fn()
      .mockResolvedValue([{ id: "group-1", name: "Goals" }]),
    createCategoryGroup: vi.fn(),
    getCategories: vi.fn().mockResolvedValue([
      {
        id: "cat-linked",
        name: "Gazebo (2026-08)",
        category_group_id: "group-1",
        goal_type: null,
        goal_target: null,
        goal_under_funded: null,
      },
    ]),
    createCategory: vi.fn(),
    updateCategoryName: vi.fn().mockResolvedValue({
      id: "cat-linked",
      name: "Patio (2027-01)",
      category_group_id: "group-1",
      goal_type: null,
      goal_target: null,
      goal_under_funded: null,
    }),
  };
  mockedCreateYnabClient.mockReturnValue(client as never);

  const categoryId = await ensureGoalCategoryLink({
    token: "token",
    budgetId: "budget",
    goal,
  });

  expect(categoryId).toBe("cat-linked");
  expect(client.updateCategoryName).toHaveBeenCalledWith(
    "budget",
    "cat-linked",
    "Patio (2027-01)",
  );
});

it("creates Goals group and category when missing", async () => {
  const client = {
    getCategoryGroups: vi.fn().mockResolvedValue([]),
    createCategoryGroup: vi
      .fn()
      .mockResolvedValue({ id: "group-1", name: "Goals" }),
    getCategories: vi.fn().mockResolvedValue([]),
    createCategory: vi.fn().mockResolvedValue({
      id: "cat-1",
      name: "Gazebo (2026-08)",
      category_group_id: "group-1",
      goal_type: null,
      goal_target: null,
      goal_under_funded: null,
    }),
    updateCategoryName: vi.fn(),
  };
  mockedCreateYnabClient.mockReturnValue(client as never);

  const categoryId = await ensureGoalCategoryLink({
    token: "token",
    budgetId: "budget",
    goal: createGoal(),
  });

  expect(client.createCategoryGroup).toHaveBeenCalledWith("budget", "Goals");
  expect(client.createCategory).toHaveBeenCalledWith(
    "budget",
    "group-1",
    "Gazebo (2026-08)",
  );
  expect(categoryId).toBe("cat-1");
});

it("reuses existing category in Goals group", async () => {
  const client = {
    getCategoryGroups: vi
      .fn()
      .mockResolvedValue([{ id: "group-1", name: "Goals" }]),
    createCategoryGroup: vi.fn(),
    getCategories: vi.fn().mockResolvedValue([
      {
        id: "cat-existing",
        name: "Gazebo (2026-08)",
        category_group_id: "group-1",
        goal_type: null,
        goal_target: null,
        goal_under_funded: null,
      },
    ]),
    createCategory: vi.fn(),
    updateCategoryName: vi.fn(),
  };
  mockedCreateYnabClient.mockReturnValue(client as never);

  const categoryId = await ensureGoalCategoryLink({
    token: "token",
    budgetId: "budget",
    goal: createGoal(),
  });

  expect(client.createCategoryGroup).not.toHaveBeenCalled();
  expect(client.createCategory).not.toHaveBeenCalled();
  expect(categoryId).toBe("cat-existing");
});
