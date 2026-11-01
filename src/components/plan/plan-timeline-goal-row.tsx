import type { KeyboardEvent, PointerEvent } from "react";

import { LoaderCircle } from "lucide-react";

import { GoalActions } from "@/components/plan/goal-actions";
import {
  addMonths,
  type GoalPlanStatus,
  goalProgressPercent,
  parseMonthStart,
  resolveGoalPlanStatus,
  toDeadlineFromIso,
  toDeadlineString,
} from "@/components/plan/goal-status";
import { useFlashAfter } from "@/components/plan/use-flash-after";
import { formatAmount } from "@/lib/formatting/currency";
import { formatMonthLabel } from "@/lib/formatting/month-label";
import { cn } from "@/lib/utils";

export type TimelineGoal = {
  id: string;
  name: string;
  targetAmount: number;
  currentBalance: number;
  deadline: string;
  status: "active" | "frozen" | "completed";
};

export type GoalTimelineRowState = GoalPlanStatus & {
  progressPercent: number;
  deadlineBoundaryPercent: number;
  /** Position of the suggested deadline (earliest reachable or earlier finish). */
  suggestionBoundaryPercent: number | null;
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
  const status = resolveGoalPlanStatus(params);
  const toPercent = (deadline: string) =>
    (params.resolveDeadlineBoundaryIndex(deadline) /
      params.visibleHorizonMonths) *
    100;
  const suggestionIso = status.isUnreachable
    ? status.earliestAchievableIso
    : status.canBeCompletedEarlier
      ? status.completedAtIso
      : null;

  return {
    ...status,
    progressPercent: goalProgressPercent(
      params.goal.currentBalance,
      params.goal.targetAmount,
    ),
    deadlineBoundaryPercent: toPercent(status.effectiveDeadline),
    suggestionBoundaryPercent: suggestionIso ? toPercent(suggestionIso) : null,
  };
};

type PlanTimelineGoalRowProps = {
  goal: TimelineGoal;
  rowState: GoalTimelineRowState;
  gridTemplateColumns: string;
  startMonthIso: string;
  isSaving: boolean;
  isRecalculating: boolean;
  areGoalActionsDisabled: boolean;
  onOpenEditGoal: (goalId: string) => void;
  onOpenDeleteGoal: (goalId: string) => void;
  onDeadlineCommit: (goalId: string, nextDeadline: string) => void;
  onDragStart: (
    goalId: string,
  ) => (event: PointerEvent<HTMLButtonElement>) => void;
};

const SuggestionButton = ({
  goal,
  rowState,
  isSaving,
  onDeadlineCommit,
}: {
  goal: TimelineGoal;
  rowState: GoalTimelineRowState;
  isSaving: boolean;
  onDeadlineCommit: (goalId: string, nextDeadline: string) => void;
}) => {
  const buttonClassName =
    "rounded-md px-1.5 py-0.5 text-[11px] font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-45";

  if (rowState.isUnreachable) {
    const earliest = rowState.earliestAchievableIso;
    if (!earliest) {
      return (
        <span className="text-[11px] font-medium text-destructive">
          Deadline needs to move
        </span>
      );
    }
    return (
      <button
        type="button"
        className={cn(
          buttonClassName,
          "-ml-1.5 text-destructive hover:bg-destructive/10",
        )}
        onClick={() => onDeadlineCommit(goal.id, toDeadlineFromIso(earliest))}
        disabled={!rowState.canApplyAchievableDate || isSaving}
        aria-label={`Apply earliest reachable date for ${goal.name}`}
      >
        Move to {formatMonthLabel(earliest)} →
      </button>
    );
  }

  if (rowState.canBeCompletedEarlier && rowState.completedAtIso) {
    const completedAt = rowState.completedAtIso;
    return (
      <button
        type="button"
        className={cn(
          buttonClassName,
          "-ml-1.5 text-primary hover:bg-primary/10",
        )}
        onClick={() =>
          onDeadlineCommit(goal.id, toDeadlineFromIso(completedAt))
        }
        disabled={!rowState.canApplyEarlierDate || isSaving}
        aria-label={`Apply earlier deadline for ${goal.name}`}
      >
        Finish by {formatMonthLabel(completedAt)} →
      </button>
    );
  }

  return null;
};

export const PlanTimelineGoalRow = ({
  goal,
  rowState,
  gridTemplateColumns,
  startMonthIso,
  isSaving,
  isRecalculating,
  areGoalActionsDisabled,
  onOpenEditGoal,
  onOpenDeleteGoal,
  onDeadlineCommit,
  onDragStart,
}: PlanTimelineGoalRowProps) => {
  const {
    effectiveDeadline,
    isUnreachable,
    progressPercent,
    deadlineBoundaryPercent,
    suggestionBoundaryPercent,
  } = rowState;
  const isHandleDisabled =
    isRecalculating || isSaving || goal.status !== "active";
  const isFlashing = useFlashAfter(isSaving);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step =
      event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    if (step === 0) {
      return;
    }
    event.preventDefault();
    const next = addMonths(parseMonthStart(effectiveDeadline), step);
    if (next.getTime() < parseMonthStart(startMonthIso).getTime()) {
      return;
    }
    onDeadlineCommit(goal.id, toDeadlineString(next));
  };

  return (
    <div
      aria-busy={isSaving}
      className={cn(
        "group/row grid border-b border-border/60 transition-colors duration-500 last:border-b-0 max-lg:grid-cols-1! lg:hover:bg-muted/20",
        isFlashing && "bg-primary/10 lg:hover:bg-primary/10",
      )}
      style={{ gridTemplateColumns }}
    >
      <div className="min-w-0 bg-card px-4 py-3.5 lg:sticky lg:left-0 lg:z-10 lg:border-r lg:border-border/60 lg:group-hover/row:bg-[color-mix(in_oklab,var(--card),var(--muted)_20%)]">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-[12px] text-sm font-semibold",
              isUnreachable
                ? "bg-destructive/12 text-destructive"
                : "bg-accent text-accent-foreground",
            )}
          >
            {goal.name.trim().charAt(0).toUpperCase() || "•"}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="line-clamp-2 min-w-0 text-sm font-semibold leading-tight">
                {goal.name}
                {isSaving ? (
                  <LoaderCircle
                    className="ml-1.5 inline size-3.5 animate-spin text-muted-foreground"
                    aria-label="Saving deadline"
                  />
                ) : null}
              </p>
              <div className="lg:opacity-0 lg:transition-opacity lg:group-focus-within/row:opacity-100 lg:group-hover/row:opacity-100">
                <GoalActions
                  goal={goal}
                  disabled={areGoalActionsDisabled}
                  buttonClassName="size-9 lg:size-7"
                  iconClassName="size-4 lg:size-3.5"
                  onOpenEditGoal={onOpenEditGoal}
                  onOpenDeleteGoal={onOpenDeleteGoal}
                />
              </div>
            </div>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground tabular-nums">
              {formatAmount(goal.currentBalance)} /{" "}
              {formatAmount(goal.targetAmount)} · {progressPercent}%
              <span className="lg:hidden">
                {" "}
                · due {formatMonthLabel(effectiveDeadline)}
              </span>
            </p>
            <div className="mt-1 min-h-5">
              <SuggestionButton
                goal={goal}
                rowState={rowState}
                isSaving={isSaving}
                onDeadlineCommit={onDeadlineCommit}
              />
            </div>
          </div>
        </div>
      </div>
      <div className="relative hidden h-full min-h-[76px] lg:block">
        <div className="absolute inset-x-0 top-1/2 h-7 -translate-y-1/2">
          <div
            className={cn(
              "absolute inset-y-0 left-0 overflow-hidden rounded-r-full rounded-l-[8px] transition-[width] duration-150",
              isUnreachable
                ? "bg-[repeating-linear-gradient(135deg,color-mix(in_oklab,var(--destructive)_30%,transparent)_0_6px,color-mix(in_oklab,var(--destructive)_18%,transparent)_6px_12px)]"
                : "bg-primary/20",
            )}
            style={{ width: `${deadlineBoundaryPercent}%` }}
          >
            <div
              className={cn(
                "h-full rounded-r-full",
                isUnreachable ? "bg-destructive/60" : "bg-primary/75",
              )}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          {suggestionBoundaryPercent !== null ? (
            <div
              aria-hidden="true"
              className={cn(
                "absolute -top-1.5 -bottom-1.5 w-0 -translate-x-1/2 border-l-2 border-dashed",
                isUnreachable ? "border-destructive/70" : "border-primary/70",
              )}
              style={{ left: `${suggestionBoundaryPercent}%` }}
            />
          ) : null}
          <button
            type="button"
            className="absolute top-1/2 flex h-8 min-w-8 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border-2 border-card bg-foreground px-2 text-[10px] font-semibold whitespace-nowrap text-background shadow-lg outline-none transition-transform hover:scale-105 focus-visible:ring-3 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ left: `${deadlineBoundaryPercent}%` }}
            onPointerDown={onDragStart(goal.id)}
            onKeyDown={handleKeyDown}
            disabled={isHandleDisabled}
            aria-label={`Resize deadline for ${goal.name}`}
            title="Drag or use ← → to move the deadline"
          >
            {formatMonthLabel(effectiveDeadline)}
          </button>
        </div>
      </div>
    </div>
  );
};
