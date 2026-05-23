import { beforeEach, expect, it, vi } from "vitest";

import {
  createMockYnabCategory,
  createTestGoal,
} from "@/lib/ynab/test-fixtures";

import { createYnabClient } from "./client";
import { hideManagedYnabCategoryForDeletedGoal } from "./hide-managed-goal-category";

vi.mock("./client", () => ({
  createYnabClient: vi.fn(),
}));

const mockedCreateYnabClient = vi.mocked(createYnabClient);

const createHideCategoryClientMock = (params: {
  category: ReturnType<typeof createMockYnabCategory> & {
    hidden: boolean;
    deleted: boolean;
  };
  categoryGroups: Array<{ id: string; name: string }>;
}) => ({
  getCategoryById: vi.fn().mockResolvedValue(params.category),
  getCategoryGroups: vi.fn().mockResolvedValue(params.categoryGroups),
  patchBudgetCategoryFields: vi.fn().mockResolvedValue({}),
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
    goal: createTestGoal(),
  });

  expect(client.getCategoryById).not.toHaveBeenCalled();
});

it("hides managed category under Goals group with canonical name", async () => {
  const goal = createTestGoal({ ynab_category_id: "cat-1" });
  const client = createHideCategoryClientMock({
    category: {
      ...createMockYnabCategory({
        id: "cat-1",
        category_group_id: "group-goals",
      }),
      hidden: false,
      deleted: false,
    },
    categoryGroups: [{ id: "group-goals", name: "Goals" }],
  });
  mockedCreateYnabClient.mockReturnValue(client as never);

  await hideManagedYnabCategoryForDeletedGoal({
    token: "token",
    budgetId: "budget",
    goal,
  });

  expect(client.patchBudgetCategoryFields).toHaveBeenCalledWith(
    "budget",
    "cat-1",
    { hidden: true },
  );
});

it("does not hide user-linked categories outside Goals group", async () => {
  const goal = createTestGoal({ ynab_category_id: "cat-1" });
  const client = createHideCategoryClientMock({
    category: {
      ...createMockYnabCategory({
        id: "cat-1",
        name: "Groceries",
        category_group_id: "group-life",
      }),
      hidden: false,
      deleted: false,
    },
    categoryGroups: [
      { id: "group-goals", name: "Goals" },
      { id: "group-life", name: "Life" },
    ],
  });
  mockedCreateYnabClient.mockReturnValue(client as never);

  await hideManagedYnabCategoryForDeletedGoal({
    token: "token",
    budgetId: "budget",
    goal,
  });

  expect(client.patchBudgetCategoryFields).not.toHaveBeenCalled();
});

it("does not hide when category name mismatches canonical YNAPB name", async () => {
  const goal = createTestGoal({ ynab_category_id: "cat-1" });
  const client = createHideCategoryClientMock({
    category: {
      ...createMockYnabCategory({
        id: "cat-1",
        name: "Custom savings",
        category_group_id: "group-goals",
      }),
      hidden: false,
      deleted: false,
    },
    categoryGroups: [{ id: "group-goals", name: "Goals" }],
  });
  mockedCreateYnabClient.mockReturnValue(client as never);

  await hideManagedYnabCategoryForDeletedGoal({
    token: "token",
    budgetId: "budget",
    goal,
  });

  expect(client.patchBudgetCategoryFields).not.toHaveBeenCalled();
});
