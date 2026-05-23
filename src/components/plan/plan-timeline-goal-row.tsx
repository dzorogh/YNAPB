import { Pencil, Trash2 } from "lucide-react";
import type { PointerEvent } from "react";

import { Button } from "@/components/ui/button";
import { formatAmount } from "@/lib/formatting/currency";

export type TimelineGoal = {
  id: string;
  name: string;
  targetAmount: number;
  currentBalance: number;
  deadline: string;
  status: "active" | "frozen" | "completed";
};

const INFO_COLUMN_WIDTH = 300;
const MONTH_WIDTH = 48;

const parseMonthStart = (value: string): Date => {
  const date = new Date(`${value.slice(0, 7)}-01T00:00:00.000Z`);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
};

const monthDiff = (left: Date, right: Date): number =>
  (left.getUTCFullYear() - right.getUTCFullYear()) * 12 +
  left.getUTCMonth() -
  right.getUTCMonth();

const toDeadlineString = (date: Date): string =>
  `${date.toISOString().slice(0, 7)}-01`;

const formatAchievableMonth = (value: string): string =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));

const formatDeadlineLabel = (value: string): string =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(parseMonthStart(value));

const formatGoalProgressPercent = (
  currentBalance: number,
  targetAmount: number,
): string => {
  if (targetAmount <= 0) {
    return "0%";
  }

  const percent = Math.min(100, (currentBalance / targetAmount) * 100);
  return `${Math.round(percent)}%`;
};

export type GoalTimelineRowState = {
  effectiveDeadline: string;
  deadlineBoundaryPercent: number;
  earliestAchievableIso: string | null | undefined;
  isUnreachable: boolean;
  completedAtIso: string | null | undefined;
  canBeCompletedEarlier: boolean;
  canApplyAchievableDate: boolean;
  canApplyEarlierDate: boolean;
  barToneClass: string;
};

export const buildGoalTimelineRowState = (params: {
  goal: TimelineGoal;
  draftDeadlines: Record<string, string>;
  unreachableByGoalId: Record<string, string | null>;
  completionByGoalId: Record<string, string | null>;
  isRecalculating: boolean;
  areGoalActionsDisabled: boolean;
  visibleHorizonMonths: number;
  resolveDeadlineBoundaryIndex: (deadline: string) => number;
}): GoalTimelineRowState => {
  const effectiveDeadline =
    params.draftDeadlines[params.goal.id] ?? params.goal.deadline;
  const deadlineBoundaryIndex =
    params.resolveDeadlineBoundaryIndex(effectiveDeadline);
  const earliestAchievableIso = params.unreachableByGoalId[params.goal.id];
  const isUnreachable = typeof earliestAchievableIso !== "undefined";
  const completedAtIso = params.completionByGoalId[params.goal.id];
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
    deadlineBoundaryPercent:
      (deadlineBoundaryIndex / params.visibleHorizonMonths) * 100,
    earliestAchievableIso,
    isUnreachable,
    completedAtIso,
    canBeCompletedEarlier,
    canApplyAchievableDate:
      Boolean(earliestAchievableIso) && canApplyGoalDeadline,
    canApplyEarlierDate:
      Boolean(completedAtIso) && canBeCompletedEarlier && canApplyGoalDeadline,
    barToneClass: isUnreachable
      ? "bg-destructive/70"
      : canBeCompletedEarlier
        ? "bg-amber-500/75"
        : "bg-primary/80",
  };
};

type PlanTimelineGoalRowProps = {
  goal: TimelineGoal;
  rowState: GoalTimelineRowState;
  visibleHorizonMonths: number;
  isRecalculating: boolean;
  areGoalActionsDisabled: boolean;
  onOpenEditGoal: (goalId: string) => void;
  onOpenDeleteGoal: (goalId: string) => void;
  onDeadlineCommit: (goalId: string, nextDeadline: string) => void;
  onDragStart: (
    goalId: string,
  ) => (event: PointerEvent<HTMLButtonElement>) => void;
};

export const PlanTimelineGoalRow = ({
  goal,
  rowState,
  visibleHorizonMonths,
  isRecalculating,
  areGoalActionsDisabled,
  onOpenEditGoal,
  onOpenDeleteGoal,
  onDeadlineCommit,
  onDragStart,
}: PlanTimelineGoalRowProps) => {
  const {
    effectiveDeadline,
    deadlineBoundaryPercent,
    earliestAchievableIso,
    isUnreachable,
    completedAtIso,
    canBeCompletedEarlier,
    canApplyAchievableDate,
    canApplyEarlierDate,
    barToneClass,
  } = rowState;

  return (
    <div
      className="grid items-center gap-3 rounded-md py-1 transition-colors hover:bg-muted/20"
      style={{
        gridTemplateColumns: `${INFO_COLUMN_WIDTH}px ${visibleHorizonMonths * MONTH_WIDTH}px`,
      }}
    >
      <div className="sticky left-0 z-10 min-w-0 rounded-md bg-background px-1 py-1 pr-2">
        <div className="grid gap-1">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 truncate text-sm font-semibold leading-tight">
              {goal.name}
            </p>
            <div className="flex shrink-0 gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => onOpenEditGoal(goal.id)}
                disabled={areGoalActionsDisabled}
                aria-label={`Edit goal ${goal.name}`}
              >
                <Pencil className="size-3" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 w-6 border-destructive/40 p-0 text-destructive hover:bg-destructive/10"
                onClick={() => onOpenDeleteGoal(goal.id)}
                disabled={areGoalActionsDisabled}
                aria-label={`Delete goal ${goal.name}`}
              >
                <Trash2 className="size-3" aria-hidden="true" />
              </Button>
            </div>
          </div>
          <div className="flex items-end justify-between gap-2">
            <p className="truncate text-[11px] font-medium text-muted-foreground">
              {formatAmount(goal.currentBalance)} /{" "}
              {formatAmount(goal.targetAmount)} (
              {formatGoalProgressPercent(
                goal.currentBalance,
                goal.targetAmount,
              )}
              )
            </p>
            <p className="shrink-0 text-[11px] text-muted-foreground">
              {formatDeadlineLabel(effectiveDeadline)}
            </p>
          </div>
        </div>
        {isUnreachable ? (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <p className="text-xs text-muted-foreground">
              {earliestAchievableIso
                ? `Need to move deadline to ${formatAchievableMonth(earliestAchievableIso)}`
                : "Need to move deadline"}
            </p>
            {earliestAchievableIso ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 px-2 text-[11px]"
                onClick={() =>
                  void onDeadlineCommit(
                    goal.id,
                    toDeadlineString(parseMonthStart(earliestAchievableIso)),
                  )
                }
                disabled={!canApplyAchievableDate}
                aria-label={`Apply earliest reachable date for ${goal.name}`}
              >
                Apply date
              </Button>
            ) : null}
          </div>
        ) : null}
        {canBeCompletedEarlier && typeof completedAtIso === "string" ? (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Can be completed earlier: {formatAchievableMonth(completedAtIso)}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 border-amber-500/40 px-2 text-[11px] text-amber-700 hover:bg-amber-500/10 dark:text-amber-400"
              onClick={() =>
                void onDeadlineCommit(
                  goal.id,
                  toDeadlineString(parseMonthStart(completedAtIso)),
                )
              }
              disabled={!canApplyEarlierDate}
              aria-label={`Apply earlier deadline for ${goal.name}`}
            >
              Shorten term
            </Button>
          </div>
        ) : null}
      </div>
      <div className="relative h-6 overflow-hidden rounded-md border bg-muted/15">
        <div className="absolute inset-px">
          <div
            className={`h-full rounded-sm transition-colors ${barToneClass}`}
            style={{ width: `${deadlineBoundaryPercent}%` }}
          />
        </div>
        <button
          type="button"
          className="absolute inset-y-px h-5 w-2.5 -translate-x-1/2 cursor-ew-resize rounded-sm border bg-background shadow-sm ring-offset-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed"
          style={{ left: `${deadlineBoundaryPercent}%` }}
          onPointerDown={onDragStart(goal.id)}
          disabled={isRecalculating || goal.status !== "active"}
          aria-label={`Resize deadline for ${goal.name}`}
        />
      </div>
    </div>
  );
};
