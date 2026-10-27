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
  earlierDeadlineByGoalId: Record<string, string | null>;
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
    barToneClass: isUnreachable ? "bg-destructive/70" : "bg-primary/70",
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
      className="grid items-center gap-3 border-b py-4 transition-colors last:border-b-0 max-lg:grid-cols-1! lg:rounded-lg lg:border-b-0 lg:py-2 lg:hover:bg-muted/30"
      style={{
        gridTemplateColumns: `${INFO_COLUMN_WIDTH}px ${visibleHorizonMonths * MONTH_WIDTH}px`,
      }}
    >
      <div className="min-w-0 rounded-lg bg-card lg:sticky lg:left-0 lg:z-10 lg:px-2 lg:py-1 lg:pr-3">
        <div className="grid gap-2 lg:gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-[15px] font-semibold leading-tight lg:text-sm">
              {goal.name}
            </p>
            <div className="flex shrink-0 gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="size-11 text-muted-foreground hover:text-foreground lg:size-7"
                onClick={() => onOpenEditGoal(goal.id)}
                disabled={areGoalActionsDisabled}
                aria-label={`Edit goal ${goal.name}`}
              >
                <Pencil className="size-4 lg:size-3.5" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="size-11 text-muted-foreground hover:bg-destructive/10 hover:text-destructive lg:size-7"
                onClick={() => onOpenDeleteGoal(goal.id)}
                disabled={areGoalActionsDisabled}
                aria-label={`Delete goal ${goal.name}`}
              >
                <Trash2 className="size-4 lg:size-3.5" aria-hidden="true" />
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="truncate font-mono text-xs text-muted-foreground tabular-nums lg:text-[11px]">
              {formatAmount(goal.currentBalance)} /{" "}
              {formatAmount(goal.targetAmount)} ·{" "}
              {formatGoalProgressPercent(
                goal.currentBalance,
                goal.targetAmount,
              )}
            </p>
            <p className="shrink-0 text-xs text-muted-foreground lg:text-[11px]">
              {formatDeadlineLabel(effectiveDeadline)}
            </p>
          </div>
          <div
            className="h-1 overflow-hidden rounded-full bg-muted lg:hidden"
            role="progressbar"
            aria-label={`Progress for ${goal.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Number.parseInt(
              formatGoalProgressPercent(goal.currentBalance, goal.targetAmount),
              10,
            )}
          >
            <div
              className="h-full rounded-full bg-primary/80"
              style={{
                width: formatGoalProgressPercent(
                  goal.currentBalance,
                  goal.targetAmount,
                ),
              }}
            />
          </div>
        </div>
        {isUnreachable ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-destructive/10 px-3 py-2 lg:mt-2 lg:py-1.5">
            <p className="text-xs text-destructive">
              {earliestAchievableIso
                ? `Move deadline to ${formatAchievableMonth(earliestAchievableIso)}`
                : "Deadline needs to move"}
            </p>
            {earliestAchievableIso ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="-mr-2 min-h-11 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive lg:min-h-7"
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
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-primary/10 px-3 py-2 lg:mt-2 lg:py-1.5">
            <p className="text-xs text-primary">
              Possible earlier: {formatAchievableMonth(completedAtIso)}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-mr-2 min-h-11 px-2 text-xs text-primary hover:bg-primary/10 hover:text-primary lg:min-h-7"
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
      <div className="relative hidden h-9 overflow-visible rounded-lg border bg-muted/40 lg:block">
        <div className="absolute inset-px overflow-hidden rounded-[7px]">
          <div
            className={`h-full rounded-[6px] transition-colors ${barToneClass}`}
            style={{ width: `${deadlineBoundaryPercent}%` }}
          />
        </div>
        <button
          type="button"
          className="absolute top-1/2 h-7 w-4 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-md border-2 border-background bg-foreground shadow-md outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ left: `${deadlineBoundaryPercent}%` }}
          onPointerDown={onDragStart(goal.id)}
          disabled={isRecalculating || goal.status !== "active"}
          aria-label={`Resize deadline for ${goal.name}`}
        />
      </div>
    </div>
  );
};
