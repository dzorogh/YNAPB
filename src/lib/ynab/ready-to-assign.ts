import type { RebalanceGoalCategory } from "./assigned-rebalance";

/** Allocates positive Ready to Assign to goal deficits in priority order. */
export const allocateReadyToAssign = (
  goals: RebalanceGoalCategory[],
  readyToAssign: number,
): Map<string, number> => {
  const next = new Map(goals.map((goal) => [goal.categoryId, goal.assigned]));
  let remaining = Math.max(0, Math.trunc(readyToAssign));

  for (const goal of goals) {
    if (remaining <= 0) break;
    if (goal.assigned < 0 || (goal.balance ?? 0) < 0) continue;

    const deficit = Math.max(0, goal.target - goal.assigned);
    const assigned = Math.min(deficit, remaining);
    if (assigned <= 0) continue;

    next.set(goal.categoryId, goal.assigned + assigned);
    remaining -= assigned;
  }

  return next;
};
