import type {
  Allocation,
  Conflict,
  Goal,
  PlanInput,
  PlanResult,
} from "./types";
import { PLANNER_TYPES_MODULE } from "./types";

const monthsBetweenInclusive = (from: Date, to: Date): number => {
  const yDiff = to.getUTCFullYear() - from.getUTCFullYear();
  const mDiff = to.getUTCMonth() - from.getUTCMonth();
  return yDiff * 12 + mDiff + 1;
};

const addMonths = (d: Date, n: number): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));

const isBeforeMonth = (a: Date, b: Date): boolean =>
  a.getUTCFullYear() < b.getUTCFullYear() ||
  (a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() < b.getUTCMonth());

type Working = Goal & { remaining: number };

const initialQueue = (goals: Goal[], startMonth: Date): Working[] =>
  goals
    .filter((g) => g.status === "active")
    .map((g) => ({ ...g, remaining: Math.max(0, g.targetAmount - g.currentBalance) }))
    .filter((g) => g.remaining > 0)
    .filter((g) => !isBeforeMonth(g.deadline, startMonth))
    .sort((a, b) =>
      a.deadline.getTime() - b.deadline.getTime() ||
      a.createdAt.getTime() - b.createdAt.getTime(),
    );

export function computePlan(input: PlanInput): PlanResult {
  void PLANNER_TYPES_MODULE;
  const queue = initialQueue(input.goals, input.startMonth);
  const allocations: Allocation[] = [];
  const completionMap: Record<string, Date | null> = {};
  for (const g of input.goals) completionMap[g.id] = null;

  for (let i = 0; i < input.horizonMonths; i++) {
    const month = addMonths(input.startMonth, i);
    let remainingBudget = input.budget.available;
    const perGoal: Record<string, number> = {};

    for (const g of queue) {
      if (g.remaining <= 0) continue;
      if (isBeforeMonth(g.deadline, month)) continue;
      if (remainingBudget <= 0) break;

      const monthsLeft = monthsBetweenInclusive(month, g.deadline);
      const neededPerMonth = g.remaining / monthsLeft;
      const contribution = Math.min(neededPerMonth, remainingBudget, g.remaining);

      perGoal[g.id] = (perGoal[g.id] ?? 0) + contribution;
      g.remaining -= contribution;
      remainingBudget -= contribution;

      if (g.remaining <= 0 && completionMap[g.id] === null) {
        completionMap[g.id] = month;
      }
    }

    allocations.push({ month, perGoal, unallocated: remainingBudget });
  }

  const conflicts: Conflict[] = [];
  return { allocations, conflicts, completionMap, autoFrozenGoalIds: [] };
}
