import { beforeEach, expect, it, vi } from "vitest";

import { createGoalsGroupClientMock } from "@/lib/ynab/test/client-mocks";
import { expectGoalCategoryLink } from "@/lib/ynab/test/goal-category-link-helpers";
import {
  createMockYnabCategory,
  createTestGoal,
} from "@/lib/ynab/test-fixtures";

import { createYnabClient } from "./client";

vi.mock("./client", () => ({
  createYnabClient: vi.fn(),
}));

const mockedCreateYnabClient = vi.mocked(createYnabClient);

beforeEach(() => {
  vi.clearAllMocks();
});

it("keeps linked category when name is already up to date", async () => {
  const goal = createTestGoal({ ynab_category_id: "cat-linked" });
  const client = createGoalsGroupClientMock({
    categories: [
      createMockYnabCategory({
        id: "cat-linked",
        name: "Gazebo (2026-08)",
      }),
    ],
  });
  mockedCreateYnabClient.mockReturnValue(client as never);

  await expectGoalCategoryLink({ goal, expectedCategoryId: "cat-linked" });
  expect(client.updateCategoryName).not.toHaveBeenCalled();
});

it("renames linked category when goal name or deadline changed", async () => {
  const goal = createTestGoal({
    ynab_category_id: "cat-linked",
    name: "Patio",
    deadline: "2027-01-01",
  });
  const client = createGoalsGroupClientMock({
    categories: [
      createMockYnabCategory({
        id: "cat-linked",
        name: "Gazebo (2026-08)",
      }),
    ],
    updateCategoryNameResult: createMockYnabCategory({
      id: "cat-linked",
      name: "Patio (2027-01)",
    }),
  });
  mockedCreateYnabClient.mockReturnValue(client as never);

  await expectGoalCategoryLink({ goal, expectedCategoryId: "cat-linked" });
  expect(client.updateCategoryName).toHaveBeenCalledWith(
    "budget",
    "cat-linked",
    "Patio (2027-01)",
  );
});

it("creates YNAPB Goals group and category when missing", async () => {
  const client = createGoalsGroupClientMock({
    categoryGroups: [],
    categories: [],
    createCategoryResult: createMockYnabCategory({ id: "cat-1" }),
  });
  mockedCreateYnabClient.mockReturnValue(client as never);

  await expectGoalCategoryLink({
    goal: createTestGoal(),
    expectedCategoryId: "cat-1",
  });

  expect(client.createCategoryGroup).toHaveBeenCalledWith(
    "budget",
    "YNAPB Goals",
  );
  expect(client.createCategory).toHaveBeenCalledWith(
    "budget",
    "group-1",
    "Gazebo (2026-08)",
  );
});

it("reuses existing category in Goals group", async () => {
  const client = createGoalsGroupClientMock({
    categories: [
      createMockYnabCategory({
        id: "cat-existing",
        name: "Gazebo (2026-08)",
      }),
    ],
  });
  mockedCreateYnabClient.mockReturnValue(client as never);

  await expectGoalCategoryLink({
    goal: createTestGoal(),
    expectedCategoryId: "cat-existing",
  });

  expect(client.createCategoryGroup).not.toHaveBeenCalled();
  expect(client.createCategory).not.toHaveBeenCalled();
});

it("reuses hidden category from any group by canonical name", async () => {
  const client = createGoalsGroupClientMock({
    categories: [
      createMockYnabCategory({
        id: "cat-other-group",
        name: "Gazebo (2026-08)",
        category_group_id: "other-group",
        hidden: true,
      }),
    ],
  });
  mockedCreateYnabClient.mockReturnValue(client as never);

  await expectGoalCategoryLink({
    goal: createTestGoal(),
    expectedCategoryId: "cat-other-group",
  });

  expect(client.createCategory).not.toHaveBeenCalled();
  expect(client.patchBudgetCategoryFields).toHaveBeenCalledWith(
    "budget",
    "cat-other-group",
    { hidden: false },
  );
});

it("reuses and unhides a hidden category in Goals group", async () => {
  const client = createGoalsGroupClientMock({
    categories: [
      createMockYnabCategory({
        id: "cat-hidden",
        name: "Gazebo (2026-08)",
        hidden: true,
      }),
    ],
  });
  mockedCreateYnabClient.mockReturnValue(client as never);

  await expectGoalCategoryLink({
    goal: createTestGoal(),
    expectedCategoryId: "cat-hidden",
  });

  expect(client.createCategory).not.toHaveBeenCalled();
  expect(client.patchBudgetCategoryFields).toHaveBeenCalledWith(
    "budget",
    "cat-hidden",
    { hidden: false },
  );
});

it("unhides a linked hidden category before push", async () => {
  const goal = createTestGoal({ ynab_category_id: "cat-linked" });
  const client = createGoalsGroupClientMock({
    categories: [
      createMockYnabCategory({
        id: "cat-linked",
        name: "Gazebo (2026-08)",
        hidden: true,
      }),
    ],
  });
  mockedCreateYnabClient.mockReturnValue(client as never);

  await expectGoalCategoryLink({ goal, expectedCategoryId: "cat-linked" });
  expect(client.createCategory).not.toHaveBeenCalled();
  expect(client.patchBudgetCategoryFields).toHaveBeenCalledWith(
    "budget",
    "cat-linked",
    { hidden: false },
  );
});
