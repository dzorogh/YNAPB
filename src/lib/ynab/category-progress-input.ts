import type { CachedYnabCategory } from "@/lib/repositories/ynab-cache-repo";
import type { YnabGoalProgressInput } from "@/lib/ynab/goal-progress";

export const toYnabGoalProgressInput = (
  category: CachedYnabCategory | null,
): YnabGoalProgressInput | null => {
  if (!category) {
    return null;
  }

  return {
    balance: category.balance,
    assigned: category.assigned,
    prior_month_available: category.prior_month_available,
    activity: category.activity,
  };
};
