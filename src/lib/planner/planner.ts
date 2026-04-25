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

const monthKey = (value: Date): string =>
  `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;

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

// The monthly allocator intentionally keeps explicit branch logic for readability.
// eslint-disable-next-line complexity,sonarjs/cognitive-complexity
export function computePlan(input: PlanInput): PlanResult {
  void PLANNER_TYPES_MODULE;
  const autoFrozenGoalIds = input.goals
    .filter((goalItem) =>
      goalItem.status === "active"
      && Math.max(0, goalItem.targetAmount - goalItem.currentBalance) > 0
      && isBeforeMonth(goalItem.deadline, input.startMonth))
    .map((goalItem) => goalItem.id);

  const liveGoals = input.goals.map((goalItem) =>
    autoFrozenGoalIds.includes(goalItem.id) ? { ...goalItem, status: "frozen" as const } : goalItem);

  const queue = initialQueue(liveGoals, input.startMonth);
  const allocations: Allocation[] = [];
  const completionMap: Record<string, Date | null> = {};
  for (const g of liveGoals) completionMap[g.id] = null;

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

  const conflicts: Conflict[] = [...detectTiedDeadlines(liveGoals, input)];
  for (const goalItem of queue) {
    if (goalItem.remaining <= 0) continue;
    const earliestAchievable = computeEarliestAchievable(goalItem.remaining, input);
    conflicts.push({
      type: "unreachable",
      goalId: goalItem.id,
      earliestAchievable,
      detail: earliestAchievable
        ? `Earliest achievable: ${earliestAchievable.toISOString().slice(0, 7)}`
        : "Not achievable within 100 years at current budget",
    });
  }

  return { allocations, conflicts, completionMap, autoFrozenGoalIds };
}

function detectTiedDeadlines(goals: Goal[], input: PlanInput): Conflict[] {
  const buckets = new Map<string, Goal[]>();
  for (const goalItem of goals) {
    if (goalItem.status !== "active") continue;
    const remaining = Math.max(0, goalItem.targetAmount - goalItem.currentBalance);
    if (remaining <= 0) continue;
    const key = monthKey(goalItem.deadline);
    const existing = buckets.get(key) ?? [];
    existing.push(goalItem);
    buckets.set(key, existing);
  }

  const result: Conflict[] = [];
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const totalRemaining = list.reduce(
      (sum, goalItem) => sum + Math.max(0, goalItem.targetAmount - goalItem.currentBalance),
      0,
    );
    const months = monthsBetweenInclusive(input.startMonth, list[0]!.deadline);
    const fundable = input.budget.available * months;
    if (fundable < totalRemaining) {
      result.push({
        type: "tied_deadline",
        goalIds: list.map((goalItem) => goalItem.id),
        deadline: list[0]!.deadline,
        detail: `Goals share deadline and combined need (${totalRemaining}) exceeds budget capacity (${fundable})`,
      });
    }
  }

  return result;
}

function computeEarliestAchievable(remaining: number, input: PlanInput): Date | null {
  if (input.budget.available <= 0) return null;
  const monthsNeeded = Math.ceil(remaining / input.budget.available);
  if (monthsNeeded > 1_200) return null;
  return addMonths(input.startMonth, monthsNeeded - 1);
}
