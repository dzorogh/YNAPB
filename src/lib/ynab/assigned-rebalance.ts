/**
 * Current-month goal category state for rebalancing assigned money.
 * All amounts are YNAB milliunits; `goals` must be in planner priority order.
 */
export type RebalanceGoalCategory = {
  categoryId: string;
  assigned: number;
  /** Planner amount for this month, not raised to assigned. */
  planned: number;
  /** MF target that YNAPB pushes (planned, raised to assigned). */
  target: number;
};

export type AssignedMove = {
  categoryId: string;
  categoryName: string;
  current: number;
  next: number;
};

/**
 * Moves money assigned above plan in one goal into goals still below their
 * target this month. Deficits are filled earliest-deadline first; surplus is
 * taken from the latest-deadline goals first. Returns next assigned per category.
 */
export const rebalanceAssignedToTargets = (
  goals: RebalanceGoalCategory[],
): Map<string, number> => {
  const next = new Map(goals.map((goal) => [goal.categoryId, goal.assigned]));

  const surpluses = [...goals]
    .reverse()
    .map((goal) => ({
      categoryId: goal.categoryId,
      amount: Math.max(0, goal.assigned - Math.max(0, goal.planned)),
    }))
    .filter((item) => item.amount > 0);

  for (const goal of goals) {
    let deficit = Math.max(0, goal.target - goal.assigned);
    for (const surplus of surpluses) {
      if (deficit <= 0) break;
      const moved = Math.min(deficit, surplus.amount);
      if (moved <= 0) continue;
      surplus.amount -= moved;
      deficit -= moved;
      next.set(surplus.categoryId, next.get(surplus.categoryId)! - moved);
      next.set(goal.categoryId, next.get(goal.categoryId)! + moved);
    }
  }

  return next;
};
