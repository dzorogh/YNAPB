import type { Goal, MonthlyBudget } from "./types";

export const M = (year: number, month1to12: number): Date =>
  new Date(Date.UTC(year, month1to12 - 1, 1));

export const goal = (overrides: Partial<Goal> & { id: string }): Goal => ({
  name: overrides.id,
  targetAmount: 0,
  currentBalance: 0,
  deadline: M(2027, 1),
  status: "active",
  ynabCategoryId: null,
  createdAt: M(2026, 1),
  ...overrides,
});

export const budget = (available: number, plannedIncome = available): MonthlyBudget => ({
  plannedIncome,
  obligations: plannedIncome - available,
  available,
  obligationBreakdown: [],
});
