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
    barToneClass: isUnreachable
      ? "bg-destructive/70"
      : canBeCompletedEarlier
        ? "bg-warning/75"
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
      className="grid items-center gap-3 rounded-lg py-2 transition-colors hover:bg-muted/30"
      style={{
        gridTemplateColumns: `${INFO_COLUMN_WIDTH}px ${visibleHorizonMonths * MONTH_WIDTH}px`,
      }}
    >
      <div className="sticky left-0 z-10 min-w-0 rounded-lg bg-card px-2 py-1 pr-3">
        <div className="grid gap-1.5">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 truncate text-sm font-semibold leading-tight">
              {goal.name}
            </p>
            <div className="flex shrink-0 gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => onOpenEditGoal(goal.id)}
                disabled={areGoalActionsDisabled}
                aria-label={`Edit goal ${goal.name}`}
              >
                <Pencil className="size-3.5" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => onOpenDeleteGoal(goal.id)}
                disabled={areGoalActionsDisabled}
                aria-label={`Delete goal ${goal.name}`}
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
              </Button>
            </div>
          </div>
          <div className="flex items-end justify-between gap-2">
            <p className="truncate font-mono text-[11px] text-muted-foreground tabular-nums">
              {formatAmount(goal.currentBalance)} /{" "}
              {formatAmount(goal.targetAmount)} ·{" "}
              {formatGoalProgressPercent(
                goal.currentBalance,
                goal.targetAmount,
              )}
            </p>
            <p className="shrink-0 text-[11px] text-muted-foreground">
              {formatDeadlineLabel(effectiveDeadline)}
            </p>
          </div>
        </div>
        {isUnreachable ? (
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <p className="text-xs text-destructive">
              {earliestAchievableIso
                ? `Move deadline to ${formatAchievableMonth(earliestAchievableIso)}`
                : "Deadline needs to move"}
            </p>
            {earliestAchievableIso ? (
              <Button
                type="button"
                variant="outline"
                size="xs"
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
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <p className="text-xs text-warning">
              Possible earlier: {formatAchievableMonth(completedAtIso)}
            </p>
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="border-warning/30 text-warning hover:bg-warning/10 hover:text-warning"
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
      <div className="relative h-9 overflow-visible rounded-lg border bg-muted/40">
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
