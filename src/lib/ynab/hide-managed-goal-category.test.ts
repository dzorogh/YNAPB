import { beforeEach, expect, it, vi } from "vitest";

import type { Tables } from "@/types/supabase";

import { createYnabClient } from "./client";
import { hideManagedYnabCategoryForDeletedGoal } from "./hide-managed-goal-category";

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

it("skips cleanup when goal has no YNAB category link", async () => {
  const client = {
    getCategoryById: vi.fn(),
    getCategoryGroups: vi.fn(),
    patchBudgetCategoryFields: vi.fn(),
  };
  mockedCreateYnabClient.mockReturnValue(client as never);

  await hideManagedYnabCategoryForDeletedGoal({
    token: "token",
    budgetId: "budget",
    goal: createGoal(),
  });

  expect(client.getCategoryById).not.toHaveBeenCalled();
});

it("hides managed category under Goals group with canonical name", async () => {
  const goal = createGoal({
    ynab_category_id: "cat-1",
  });
  const client = {
    getCategoryById: vi.fn().mockResolvedValue({
      id: "cat-1",
      name: "Gazebo (2026-08)",
      category_group_id: "group-goals",
      hidden: false,
      deleted: false,
      goal_type: null,
      goal_target: null,
      goal_under_funded: null,
    }),
    getCategoryGroups: vi
      .fn()
      .mockResolvedValue([{ id: "group-goals", name: "Goals" }]),
    patchBudgetCategoryFields: vi.fn().mockResolvedValue({}),
  };
  mockedCreateYnabClient.mockReturnValue(client as never);

  await hideManagedYnabCategoryForDeletedGoal({
    token: "token",
    budgetId: "budget",
    goal,
  });

  expect(client.patchBudgetCategoryFields).toHaveBeenCalledWith(
    "budget",
    "cat-1",
    {
      hidden: true,
    },
  );
});

it("does not hide user-linked categories outside Goals group", async () => {
  const goal = createGoal({
    ynab_category_id: "cat-1",
  });
  const client = {
    getCategoryById: vi.fn().mockResolvedValue({
      id: "cat-1",
      name: "Groceries",
      category_group_id: "group-life",
      hidden: false,
      deleted: false,
      goal_type: null,
      goal_target: null,
      goal_under_funded: null,
    }),
    getCategoryGroups: vi.fn().mockResolvedValue([
      { id: "group-goals", name: "Goals" },
      { id: "group-life", name: "Life" },
    ]),
    patchBudgetCategoryFields: vi.fn(),
  };
  mockedCreateYnabClient.mockReturnValue(client as never);

  await hideManagedYnabCategoryForDeletedGoal({
    token: "token",
    budgetId: "budget",
    goal,
  });

  expect(client.patchBudgetCategoryFields).not.toHaveBeenCalled();
});

it("does not hide when category name mismatches canonical YNAPB name", async () => {
  const goal = createGoal({
    ynab_category_id: "cat-1",
  });
  const client = {
    getCategoryById: vi.fn().mockResolvedValue({
      id: "cat-1",
      name: "Custom savings",
      category_group_id: "group-goals",
      hidden: false,
      deleted: false,
      goal_type: null,
      goal_target: null,
      goal_under_funded: null,
    }),
    getCategoryGroups: vi
      .fn()
      .mockResolvedValue([{ id: "group-goals", name: "Goals" }]),
    patchBudgetCategoryFields: vi.fn(),
  };
  mockedCreateYnabClient.mockReturnValue(client as never);

  await hideManagedYnabCategoryForDeletedGoal({
    token: "token",
    budgetId: "budget",
    goal,
  });

  expect(client.patchBudgetCategoryFields).not.toHaveBeenCalled();
});
