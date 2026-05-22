import { vi } from "vitest";

import {
  createMockYnabCategory,
  type MockYnabCategory,
} from "@/lib/ynab/test-fixtures";

export const createGoalsGroupClientMock = (params: {
  categoryGroups?: Array<{ id: string; name: string }>;
  categories?: MockYnabCategory[];
  createCategoryResult?: MockYnabCategory;
  updateCategoryNameResult?: MockYnabCategory;
}) => ({
  getCategoryGroups: vi
    .fn()
    .mockResolvedValue(
      params.categoryGroups ?? [{ id: "group-1", name: "Goals" }],
    ),
  createCategoryGroup: vi
    .fn()
    .mockResolvedValue({ id: "group-1", name: "Goals" }),
  getCategories: vi.fn().mockResolvedValue(params.categories ?? []),
  createCategory: vi
    .fn()
    .mockResolvedValue(
      params.createCategoryResult ??
        createMockYnabCategory({ id: "cat-1" }),
    ),
  updateCategoryName: vi
    .fn()
    .mockResolvedValue(params.updateCategoryNameResult),
});
