import type { CachedYnabCategory } from "@/lib/repositories/ynab-cache-repo";

const toMilliunits = (amount: number): number => Math.round(amount * 1000);

export const activeGoalCategoryIds = (
  goals: Array<{ status: string; ynab_category_id: string | null }>,
): Set<string> =>
  new Set(
    goals.flatMap((goal) =>
      goal.status === "active" && goal.ynab_category_id
        ? [goal.ynab_category_id]
        : [],
    ),
  );

export type WithdrawalShift = {
  categoryId: string;
  categoryName: string;
  /** `YYYY-MM` of the prior month that absorbs the withdrawal. */
  priorMonth: string;
  /** Prior-month assigned, milliunits. */
  current: number;
  next: number;
};

const priorMonthKey = (month: string): string => {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 7);
};

/**
 * Money moved out of a goal this month (negative assigned) is booked against
 * the prior month instead, so the month starts from what was left. YNAB's
 * monthly target then asks only for this month's part, which keeps YNAB
 * Auto-Assign usable. Category balances and current Ready to Assign do not
 * change. Spending on the goal is activity, not assigned, so it is untouched.
 */
export const shiftWithdrawalsToPriorMonth = (
  categories: CachedYnabCategory[],
  goalCategoryIds: Set<string>,
  month: string,
): { categories: CachedYnabCategory[]; shifts: WithdrawalShift[] } => {
  const shifts: WithdrawalShift[] = [];
  const next = categories.map((category) => {
    const assigned = toMilliunits(category.assigned ?? 0);
    const priorAssigned = category.prior_month_assigned;
    if (
      !goalCategoryIds.has(category.id) ||
      assigned >= 0 ||
      (category.balance ?? 0) < 0 ||
      priorAssigned === null
    ) {
      return category;
    }

    // Lowering prior assigned must not overspend the prior month.
    const shifted = Math.min(
      -assigned,
      toMilliunits(Math.max(0, category.prior_month_available ?? 0)),
    );
    if (shifted <= 0) {
      return category;
    }

    const priorCurrent = toMilliunits(priorAssigned);
    shifts.push({
      categoryId: category.id,
      categoryName: category.name,
      priorMonth: priorMonthKey(month),
      current: priorCurrent,
      next: priorCurrent - shifted,
    });
    return {
      ...category,
      assigned: (assigned + shifted) / 1000,
      prior_month_assigned: (priorCurrent - shifted) / 1000,
      prior_month_available:
        (category.prior_month_available ?? 0) - shifted / 1000,
    };
  });

  return {
    categories: next,
    shifts: shifts.sort((left, right) =>
      left.categoryId.localeCompare(right.categoryId),
    ),
  };
};
