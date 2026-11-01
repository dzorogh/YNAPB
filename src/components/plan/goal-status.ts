export const parseMonthStart = (value: string): Date => {
  const date = new Date(`${value.slice(0, 7)}-01T00:00:00.000Z`);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
};

export const monthDiff = (left: Date, right: Date): number =>
  (left.getUTCFullYear() - right.getUTCFullYear()) * 12 +
  left.getUTCMonth() -
  right.getUTCMonth();

export const addMonths = (date: Date, months: number): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));

export const toDeadlineString = (date: Date): string =>
  `${date.toISOString().slice(0, 7)}-01`;

/** Converts an ISO month (from planner output) into a goal deadline string. */
export const toDeadlineFromIso = (value: string): string =>
  toDeadlineString(parseMonthStart(value));

export const goalProgressPercent = (
  currentBalance: number,
  targetAmount: number,
): number => {
  if (targetAmount <= 0) {
    return 0;
  }
  return Math.round(
    Math.min(100, Math.max(0, (currentBalance / targetAmount) * 100)),
  );
};

export type GoalPlanStatus = {
  effectiveDeadline: string;
  /** `undefined` when the goal is reachable; `null` when no reachable month exists. */
  earliestAchievableIso: string | null | undefined;
  isUnreachable: boolean;
  completedAtIso: string | null | undefined;
  canBeCompletedEarlier: boolean;
  canApplyAchievableDate: boolean;
  canApplyEarlierDate: boolean;
};

export const resolveGoalPlanStatus = (params: {
  goal: { id: string; deadline: string; status: string };
  draftDeadlines: Record<string, string>;
  unreachableByGoalId: Record<string, string | null>;
  earlierDeadlineByGoalId: Record<string, string | null>;
  isRecalculating: boolean;
  areGoalActionsDisabled: boolean;
}): GoalPlanStatus => {
  const effectiveDeadline =
    params.draftDeadlines[params.goal.id] ?? params.goal.deadline;
  const earliestAchievableIso = params.unreachableByGoalId[params.goal.id];
  const isUnreachable = typeof earliestAchievableIso !== "undefined";
  const completedAtIso = params.earlierDeadlineByGoalId[params.goal.id];
  const canBeCompletedEarlier =
    !isUnreachable &&
    typeof completedAtIso === "string" &&
    monthDiff(
      parseMonthStart(effectiveDeadline),
      parseMonthStart(completedAtIso),
    ) > 0;
  const canApplyGoalDeadline =
    !params.isRecalculating &&
    !params.areGoalActionsDisabled &&
    params.goal.status === "active";

  return {
    effectiveDeadline,
    earliestAchievableIso,
    isUnreachable,
    completedAtIso,
    canBeCompletedEarlier,
    canApplyAchievableDate:
      Boolean(earliestAchievableIso) && canApplyGoalDeadline,
    canApplyEarlierDate:
      Boolean(completedAtIso) && canBeCompletedEarlier && canApplyGoalDeadline,
  };
};
