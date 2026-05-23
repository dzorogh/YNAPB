import {
  monthStartFromDate,
  monthsDiffInclusive,
  normalizeToMonthStart,
} from "@/lib/dates/month";
import { parseYnabCategoryMonthFromName } from "@/lib/ynab/goal-category-link";

/**
 * Progress toward a YNAPB goal from a linked YNAB category.
 *
 * Only **assigned** (budgeted) amounts matter for display — not activity or
 * current available. Includes «Cash left over from last month» as prior-month
 * available (unspent assigned from earlier).
 */
export type YnabGoalProgressInput = {
  balance: number | null;
  /** Assigned (budgeted) in the current YNAB month. */
  assigned?: number | null;
  /** Prior month ending available — YNAB cash left over into this month. */
  prior_month_available?: number | null;
  /**
   * Used only to derive carryover when `prior_month_available` is missing
   * (category did not exist in the prior synced month).
   */
  activity?: number | null;
};

const resolveYnabAvailableBalance = (balance: number | null): number => {
  if (typeof balance === "number" && Number.isFinite(balance)) {
    return Math.max(0, balance);
  }

  return 0;
};

/**
 * Monthly Funding `goal_target` for YNAB.
 *
 * In the deadline month: assign `target - carryover` so the category can reach the
 * full target (28k rollover + ~192k assign = 220k). Earlier months spread what is
 * left after total assigned progress.
 */
export const computeYnabMonthlyFundingTarget = ({
  targetAmount,
  carryoverFromLastMonth,
  savedProgress,
  deadline,
  now,
}: {
  targetAmount: number;
  carryoverFromLastMonth: number;
  savedProgress: number;
  deadline: string;
  now: Date;
}): number => {
  const currentMonth = monthStartFromDate(now);
  const deadlineMonth = normalizeToMonthStart(deadline);
  const monthsRemaining = monthsDiffInclusive(currentMonth, deadlineMonth);
  const remainingAmount =
    monthsRemaining <= 1
      ? Math.max(0, targetAmount - carryoverFromLastMonth)
      : Math.max(0, targetAmount - savedProgress);

  if (remainingAmount === 0) {
    return 0;
  }

  if (monthsRemaining <= 0) {
    return remainingAmount;
  }

  return remainingAmount / monthsRemaining;
};

const resolveGoalAssignedThisMonth = (input: YnabGoalProgressInput): number => {
  if (typeof input.assigned === "number" && Number.isFinite(input.assigned)) {
    return Math.max(0, input.assigned);
  }

  return 0;
};

const readYnabActivity = (input: YnabGoalProgressInput): number | null => {
  if (typeof input.activity === "number" && Number.isFinite(input.activity)) {
    return input.activity;
  }

  return null;
};

const resolveCarryoverFromYnabIdentity = (
  input: YnabGoalProgressInput,
): number => {
  const available = resolveYnabAvailableBalance(input.balance);
  const assigned = resolveGoalAssignedThisMonth(input);
  const activity = readYnabActivity(input) ?? 0;

  return Math.max(0, available - assigned - activity);
};

/**
 * YNAB «Cash left over from last month» — not the same as prior month assigned.
 *
 * Ignores `prior_month_available` when it equals current available (stale sync
 * that used the open budget month instead of the calendar prior month).
 */
export const resolveCarryoverFromLastMonth = (
  input: YnabGoalProgressInput,
): number => {
  const available = resolveYnabAvailableBalance(input.balance);
  const assigned = resolveGoalAssignedThisMonth(input);
  const activity = readYnabActivity(input);

  if (
    typeof input.prior_month_available === "number" &&
    Number.isFinite(input.prior_month_available)
  ) {
    const prior = Math.max(0, input.prior_month_available);
    const priorLooksLikeCurrentAvailable =
      assigned > 0 && Math.abs(prior - available) < 1;

    if (!priorLooksLikeCurrentAvailable) {
      return prior;
    }

    if (activity !== null) {
      return resolveCarryoverFromYnabIdentity(input);
    }
  }

  return resolveCarryoverFromYnabIdentity(input);
};

/**
 * Total assigned for display: this month + cash left over from last month.
 *
 * When activity is present, also checks YNAB identity
 * `available = carryover + assigned + activity` → funded = available − activity,
 * so a wrong prior-month snapshot (e.g. current available) cannot inflate progress.
 */
export const resolveGoalTotalAssigned = (
  input: YnabGoalProgressInput,
): number => {
  const assigned = resolveGoalAssignedThisMonth(input);
  const carryover = resolveCarryoverFromLastMonth(input);
  const fromAssignedAndCarryover = assigned + carryover;

  const available = resolveYnabAvailableBalance(input.balance);
  const activity =
    typeof input.activity === "number" && Number.isFinite(input.activity)
      ? input.activity
      : null;

  if (activity === null) {
    return fromAssignedAndCarryover;
  }

  const fromAvailableIdentity = Math.max(0, available - activity);
  if (fromAvailableIdentity < fromAssignedAndCarryover - 1) {
    return fromAvailableIdentity;
  }

  return fromAssignedAndCarryover;
};

export const resolveGoalAmountsFromCategory = (
  input: YnabGoalProgressInput | null,
): {
  currentBalance: number;
  savedProgress: number;
  availableBalance: number;
  carryoverFromLastMonth: number;
} => {
  if (!input) {
    return {
      currentBalance: 0,
      savedProgress: 0,
      availableBalance: 0,
      carryoverFromLastMonth: 0,
    };
  }

  const totalAssigned = resolveGoalTotalAssigned(input);

  return {
    currentBalance: totalAssigned,
    savedProgress: totalAssigned,
    availableBalance: resolveYnabAvailableBalance(input.balance),
    carryoverFromLastMonth: resolveCarryoverFromLastMonth(input),
  };
};

const deadlineMonthKey = (deadline: string): string => deadline.slice(0, 7);

const pushMonthKey = (pushMonth: string): string => pushMonth.slice(0, 7);

/**
 * Whether this push should set MF to `target - carryover` (finish funding now).
 *
 * True when the push month matches the goal deadline month, or when the linked
 * YNAB category is named for this month (e.g. stale `(2026-05)` after a deadline shift).
 */
export const shouldUseFullMonthFundingForPush = ({
  goalDeadline,
  pushMonth,
  categoryName,
}: {
  goalDeadline: string;
  pushMonth: string;
  categoryName?: string | null;
}): boolean => {
  const month = pushMonthKey(pushMonth);

  if (deadlineMonthKey(goalDeadline) === month) {
    return true;
  }

  if (!categoryName) {
    return false;
  }

  return parseYnabCategoryMonthFromName(categoryName) === month;
};

/** MF for a goal in its funding month: assign enough to reach the full target. */
export const resolveFullMonthFundingTarget = ({
  targetAmount,
  carryoverFromLastMonth,
}: {
  targetAmount: number;
  carryoverFromLastMonth: number;
}): number => Math.max(0, targetAmount - carryoverFromLastMonth);

/**
 * MF targets for Push to YNAB for a specific plan month.
 *
 * - Funding month: assign `target - carryover` (finish the goal now).
 * - Otherwise: planner allocation for that month only (do not front-load other goals).
 */
export const buildMonthlyFundingTargetsForPush = ({
  goals,
  categoriesById,
  categoryNamesById,
  categoryGoalTargetsById,
  pushMonth,
  plannerAllocationForMonth,
}: {
  goals: Array<{
    id: string;
    targetAmount: number;
    deadline: string;
    ynabCategoryId: string | null;
  }>;
  categoriesById: Map<string, YnabGoalProgressInput | null>;
  categoryNamesById?: Map<string, string>;
  /** Current YNAB MF `goal_target` from cache (milliunits already converted). */
  categoryGoalTargetsById?: Map<string, number | null>;
  /** `YYYY-MM` of the month being pushed. */
  pushMonth: string;
  plannerAllocationForMonth: Record<string, number>;
}): Record<string, number> => {
  const targets: Record<string, number> = {};

  for (const goal of goals) {
    const categoryName = goal.ynabCategoryId
      ? categoryNamesById?.get(goal.ynabCategoryId)
      : undefined;

    if (
      !shouldUseFullMonthFundingForPush({
        goalDeadline: goal.deadline,
        pushMonth,
        categoryName,
      })
    ) {
      targets[goal.id] = Math.max(0, plannerAllocationForMonth[goal.id] ?? 0);
      continue;
    }

    const progressInput = goal.ynabCategoryId
      ? (categoriesById.get(goal.ynabCategoryId) ?? null)
      : null;
    const amounts = resolveGoalAmountsFromCategory(progressInput);

    let nextTarget = resolveFullMonthFundingTarget({
      targetAmount: goal.targetAmount,
      carryoverFromLastMonth: amounts.carryoverFromLastMonth,
    });

    const currentYnabTarget =
      goal.ynabCategoryId && categoryGoalTargetsById
        ? categoryGoalTargetsById.get(goal.ynabCategoryId)
        : null;
    if (
      typeof currentYnabTarget === "number" &&
      Number.isFinite(currentYnabTarget) &&
      amounts.savedProgress >= goal.targetAmount - 1
    ) {
      nextTarget = Math.max(nextTarget, currentYnabTarget);
    }

    targets[goal.id] = nextTarget;
  }

  return targets;
};
