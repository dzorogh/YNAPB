"use client";

import { Plus } from "lucide-react";

import { GoalActions } from "@/components/plan/goal-actions";

import {
  type GoalPlanStatus,
  goalProgressPercent,
  monthDiff,
  parseMonthStart,
  resolveGoalPlanStatus,
  toDeadlineFromIso,
} from "@/components/plan/goal-status";
import type { TimelineGoal } from "@/components/plan/plan-timeline-goal-row";
import { Button } from "@/components/ui/button";
import { formatAmount } from "@/lib/formatting/currency";
import { formatMonthLabel } from "@/lib/formatting/month-label";
import { cn } from "@/lib/utils";

type PlanGoalCardsProps = {
  goals: TimelineGoal[];
  startMonthIso: string;
  monthlyContributionByGoalId: Record<string, number>;
  unreachableByGoalId: Record<string, string | null>;
  earlierDeadlineByGoalId: Record<string, string | null>;
  draftDeadlines: Record<string, string>;
  isRecalculating: boolean;
  areGoalActionsDisabled: boolean;
  onOpenCreateGoal: () => void;
  onOpenEditGoal: (goalId: string) => void;
  onOpenDeleteGoal: (goalId: string) => void;
  onDeadlineCommit: (goalId: string, nextDeadline: string) => void;
};

type StatusTone = "risk" | "early" | "funded" | "ok";

const STATUS_BADGES: Record<StatusTone, { label: string; className: string }> =
  {
    risk: {
      label: "At risk",
      className: "bg-destructive/15 text-destructive",
    },
    early: {
      label: "Can finish early",
      className: "bg-primary/15 text-primary",
    },
    funded: { label: "Funded", className: "bg-success/15 text-success" },
    ok: { label: "On track", className: "bg-success/15 text-success" },
  };

const resolveTone = (status: GoalPlanStatus, progress: number): StatusTone => {
  if (status.isUnreachable) {
    return "risk";
  }
  if (progress >= 100) {
    return "funded";
  }
  return status.canBeCompletedEarlier ? "early" : "ok";
};

const pluralizeMonths = (count: number): string =>
  count === 1 ? "1 month" : `${count} months`;

const GoalCardAction = ({
  goal,
  status,
  onDeadlineCommit,
}: {
  goal: TimelineGoal;
  status: GoalPlanStatus;
  onDeadlineCommit: (goalId: string, nextDeadline: string) => void;
}) => {
  const actionClassName = "mt-4 h-10 w-full rounded-[12px] font-semibold";

  if (status.isUnreachable) {
    if (!status.earliestAchievableIso) {
      return (
        <p className="mt-4 rounded-[12px] bg-destructive/10 px-3 py-2.5 text-center text-xs text-destructive">
          Deadline needs to move — no reachable month in the horizon
        </p>
      );
    }
    const earliest = status.earliestAchievableIso;
    return (
      <Button
        type="button"
        variant="destructive"
        className={actionClassName}
        onClick={() => onDeadlineCommit(goal.id, toDeadlineFromIso(earliest))}
        disabled={!status.canApplyAchievableDate}
        aria-label={`Apply earliest reachable date for ${goal.name}`}
      >
        Move deadline to {formatMonthLabel(earliest)}
      </Button>
    );
  }

  if (status.canBeCompletedEarlier && status.completedAtIso) {
    const completedAt = status.completedAtIso;
    return (
      <Button
        type="button"
        variant="secondary"
        className={cn(
          actionClassName,
          "bg-primary/12 text-primary hover:bg-primary/20",
        )}
        onClick={() =>
          onDeadlineCommit(goal.id, toDeadlineFromIso(completedAt))
        }
        disabled={!status.canApplyEarlierDate}
        aria-label={`Apply earlier deadline for ${goal.name}`}
      >
        Finish by {formatMonthLabel(completedAt)}
      </Button>
    );
  }

  return null;
};

const GoalCard = ({
  goal,
  status,
  startMonth,
  monthlyContribution,
  areGoalActionsDisabled,
  onOpenEditGoal,
  onOpenDeleteGoal,
  onDeadlineCommit,
}: {
  goal: TimelineGoal;
  status: GoalPlanStatus;
  startMonth: Date;
  monthlyContribution: number;
  areGoalActionsDisabled: boolean;
  onOpenEditGoal: (goalId: string) => void;
  onOpenDeleteGoal: (goalId: string) => void;
  onDeadlineCommit: (goalId: string, nextDeadline: string) => void;
}) => {
  const progress = goalProgressPercent(goal.currentBalance, goal.targetAmount);
  const tone = resolveTone(status, progress);
  const badge = STATUS_BADGES[tone];
  const monthsLeft = Math.max(
    monthDiff(parseMonthStart(status.effectiveDeadline), startMonth) + 1,
    0,
  );
  const remaining = Math.max(goal.targetAmount - goal.currentBalance, 0);

  return (
    <article
      aria-label={goal.name}
      className={cn(
        "flex flex-col rounded-[20px] border bg-card p-5 transition-colors",
        tone === "risk"
          ? "border-destructive/25"
          : "border-border/70 hover:border-border",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          aria-hidden="true"
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-[14px] text-base font-semibold",
            tone === "risk"
              ? "bg-destructive/12 text-destructive"
              : "bg-accent text-accent-foreground",
          )}
        >
          {goal.name.trim().charAt(0).toUpperCase() || "•"}
        </span>
        <div className="flex items-center gap-1">
          <span
            className={cn(
              "mr-1 rounded-full px-2.5 py-1 text-[11px] font-semibold",
              badge.className,
            )}
          >
            {badge.label}
          </span>
          <GoalActions
            goal={goal}
            disabled={areGoalActionsDisabled}
            buttonClassName="size-9 lg:size-8"
            onOpenEditGoal={onOpenEditGoal}
            onOpenDeleteGoal={onOpenDeleteGoal}
          />
        </div>
      </div>

      <h3 className="mt-3 truncate text-base font-semibold tracking-[-0.01em]">
        {goal.name}
      </h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Due {formatMonthLabel(status.effectiveDeadline)} ·{" "}
        {pluralizeMonths(monthsLeft)}
        {remaining > 0 ? (
          <>
            {" "}
            · <span className="tabular-nums">{formatAmount(remaining)}</span> to
            go
          </>
        ) : null}
      </p>

      <div
        className="mt-4 h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={`Progress for ${goal.name}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width]",
            tone === "risk" ? "bg-destructive/80" : "bg-primary",
          )}
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="mt-2.5 flex items-end justify-between gap-3 text-xs">
        <span className="text-muted-foreground tabular-nums">
          {formatAmount(goal.currentBalance)} /{" "}
          {formatAmount(goal.targetAmount)}
        </span>
        <span className="text-muted-foreground">
          <span className="text-[15px] font-semibold text-foreground tabular-nums">
            {formatAmount(monthlyContribution)}
          </span>{" "}
          /mo
        </span>
      </div>

      <div className="mt-auto">
        <GoalCardAction
          goal={goal}
          status={status}
          onDeadlineCommit={onDeadlineCommit}
        />
      </div>
    </article>
  );
};

export const PlanGoalCards = ({
  goals,
  startMonthIso,
  monthlyContributionByGoalId,
  unreachableByGoalId,
  earlierDeadlineByGoalId,
  draftDeadlines,
  isRecalculating,
  areGoalActionsDisabled,
  onOpenCreateGoal,
  onOpenEditGoal,
  onOpenDeleteGoal,
  onDeadlineCommit,
}: PlanGoalCardsProps) => {
  const startMonth = parseMonthStart(startMonthIso);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {goals.map((goal) => (
        <GoalCard
          key={goal.id}
          goal={goal}
          status={resolveGoalPlanStatus({
            goal,
            draftDeadlines,
            unreachableByGoalId,
            earlierDeadlineByGoalId,
            isRecalculating,
            areGoalActionsDisabled,
          })}
          startMonth={startMonth}
          monthlyContribution={monthlyContributionByGoalId[goal.id] ?? 0}
          areGoalActionsDisabled={areGoalActionsDisabled}
          onOpenEditGoal={onOpenEditGoal}
          onOpenDeleteGoal={onOpenDeleteGoal}
          onDeadlineCommit={onDeadlineCommit}
        />
      ))}
      <button
        type="button"
        onClick={onOpenCreateGoal}
        disabled={areGoalActionsDisabled}
        aria-label="Create goal"
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-[20px] border-2 border-dashed border-border/80 p-6 text-sm font-semibold text-muted-foreground transition-colors outline-none hover:border-primary/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45",
          goals.length === 0
            ? "min-h-40 sm:col-span-2"
            : "min-h-28 sm:min-h-52",
        )}
      >
        <Plus className="size-5" aria-hidden="true" />
        {goals.length === 0 ? (
          <span className="text-center">
            <span className="block text-foreground">No goals to display.</span>
            <span className="mt-1 block font-normal">
              Create your first goal to see deadlines and monthly contributions.
            </span>
          </span>
        ) : (
          "New goal"
        )}
      </button>
    </div>
  );
};
