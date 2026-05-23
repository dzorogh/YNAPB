"use client";
/* eslint-disable max-lines-per-function */

import { Pencil, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, type PointerEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAmount } from "@/lib/formatting/currency";

type TimelineGoal = {
  id: string;
  name: string;
  targetAmount: number;
  currentBalance: number;
  deadline: string;
  status: "active" | "frozen" | "completed";
};

type PlanTimelineProps = {
  goals: TimelineGoal[];
  startMonthIso: string;
  horizonMonths: number;
  unreachableByGoalId: Record<string, string | null>;
  completionByGoalId: Record<string, string | null>;
  draftDeadlines: Record<string, string>;
  isRecalculating: boolean;
  onOpenCreateGoal: () => void;
  onOpenEditGoal: (goalId: string) => void;
  onOpenDeleteGoal: (goalId: string) => void;
  areGoalActionsDisabled: boolean;
  onDragStartSnapshot: () => void;
  onDeadlinePreview: (goalId: string, nextDeadline: string) => void;
  onDeadlineCommit: (goalId: string, nextDeadline: string) => void;
  onCancelPreview: () => void;
};

const MONTH_WIDTH = 48;
const INFO_COLUMN_WIDTH = 300;
const GRID_GAP_PX = 12;
const MIN_VISIBLE_MONTHS = 60;
const MAX_VISIBLE_MONTHS = 240;
const EXTRA_VISIBLE_MONTHS_BUFFER = 6;

const parseMonthStart = (value: string): Date => {
  const date = new Date(`${value.slice(0, 7)}-01T00:00:00.000Z`);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
};

const addMonths = (date: Date, months: number): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));

const monthDiff = (left: Date, right: Date): number =>
  (left.getUTCFullYear() - right.getUTCFullYear()) * 12 +
  left.getUTCMonth() -
  right.getUTCMonth();

const toDeadlineString = (date: Date): string =>
  `${date.toISOString().slice(0, 7)}-01`;

const formatMonthLabel = (value: Date): string =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  }).format(value);

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

export const PlanTimeline = ({
  goals,
  startMonthIso,
  horizonMonths,
  unreachableByGoalId,
  completionByGoalId,
  draftDeadlines,
  isRecalculating,
  onOpenCreateGoal,
  onOpenEditGoal,
  onOpenDeleteGoal,
  areGoalActionsDisabled,
  onDragStartSnapshot,
  onDeadlinePreview,
  onDeadlineCommit,
  onCancelPreview,
}: PlanTimelineProps) => {
  const startMonth = useMemo(
    () => parseMonthStart(startMonthIso),
    [startMonthIso],
  );
  const railRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{ goalId: string; active: boolean } | null>(null);

  const visibleHorizonMonths = useMemo(() => {
    const furthestGoalBoundary = goals.reduce((maxBoundary, goal) => {
      const effectiveDeadline = draftDeadlines[goal.id] ?? goal.deadline;
      const boundary =
        monthDiff(parseMonthStart(effectiveDeadline), startMonth) + 1;
      return Math.max(maxBoundary, boundary);
    }, 1);
    const desiredVisibleMonths = Math.max(
      horizonMonths,
      furthestGoalBoundary + EXTRA_VISIBLE_MONTHS_BUFFER,
      MIN_VISIBLE_MONTHS,
    );
    return Math.min(desiredVisibleMonths, MAX_VISIBLE_MONTHS);
  }, [draftDeadlines, goals, horizonMonths, startMonth]);

  const monthTicks = useMemo(
    () =>
      Array.from({ length: visibleHorizonMonths }, (_, index) =>
        addMonths(startMonth, index),
      ),
    [startMonth, visibleHorizonMonths],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      if (!dragStateRef.current?.active) {
        return;
      }
      dragStateRef.current = null;
      onCancelPreview();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onCancelPreview]);

  const resolveDeadlineBoundaryIndex = (deadline: string): number => {
    const deadlineDate = parseMonthStart(deadline);
    const boundaryIndex = monthDiff(deadlineDate, startMonth) + 1;
    return Math.min(Math.max(boundaryIndex, 1), visibleHorizonMonths);
  };

  const boundaryIndexFromClientX = (clientX: number): number => {
    const rail = railRef.current;
    if (!rail) {
      return 1;
    }
    const rect = rail.getBoundingClientRect();
    const timelineStartX = rect.left + INFO_COLUMN_WIDTH + GRID_GAP_PX;
    const relativeX = clientX - timelineStartX;
    const boundaryIndex = Math.round(relativeX / MONTH_WIDTH);
    return Math.min(Math.max(boundaryIndex, 1), visibleHorizonMonths);
  };

  const handleDragStart =
    (goalId: string) => (event: PointerEvent<HTMLButtonElement>) => {
      if (isRecalculating) {
        return;
      }
      event.preventDefault();
      onDragStartSnapshot();
      dragStateRef.current = { goalId, active: true };
      event.currentTarget.setPointerCapture(event.pointerId);
    };

  const handleDragMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current?.active) {
      return;
    }
    const boundaryIndex = boundaryIndexFromClientX(event.clientX);
    onDeadlinePreview(
      dragStateRef.current.goalId,
      toDeadlineString(addMonths(startMonth, boundaryIndex - 1)),
    );
  };

  const handleDragEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current?.active) {
      return;
    }
    const boundaryIndex = boundaryIndexFromClientX(event.clientX);
    const nextDeadline = toDeadlineString(
      addMonths(startMonth, boundaryIndex - 1),
    );
    onDeadlineCommit(dragStateRef.current.goalId, nextDeadline);
    dragStateRef.current = null;
  };

  if (goals.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No goals to display.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="min-w-0">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Timeline</CardTitle>
          <Button
            type="button"
            onClick={onOpenCreateGoal}
            disabled={areGoalActionsDisabled}
            aria-label="Create goal"
          >
            + Create goal
          </Button>
        </div>
      </CardHeader>
      <CardContent className="min-w-0 space-y-3 overflow-hidden">
        <div className="w-full max-w-full overflow-x-auto overscroll-x-none overscroll-y-none">
          <div
            className="space-y-1.5 rounded-md border bg-background py-2"
            style={{
              minWidth: `${Math.max(900, INFO_COLUMN_WIDTH + visibleHorizonMonths * MONTH_WIDTH + GRID_GAP_PX)}px`,
            }}
            ref={railRef}
            onPointerMove={handleDragMove}
            onPointerUp={handleDragEnd}
          >
            <div
              className="grid items-end gap-3"
              style={{
                gridTemplateColumns: `${INFO_COLUMN_WIDTH}px ${visibleHorizonMonths * MONTH_WIDTH}px`,
              }}
            >
              <div className="sticky left-0 z-20 min-h-full self-stretch border-b bg-background" />
              <div
                className="grid"
                style={{
                  gridTemplateColumns: `repeat(${visibleHorizonMonths}, ${MONTH_WIDTH}px)`,
                }}
              >
                {monthTicks.map((tick) => (
                  <div
                    key={tick.toISOString()}
                    className="border-b py-1 text-center text-[11px] font-medium text-muted-foreground/90"
                  >
                    {formatMonthLabel(tick)}
                  </div>
                ))}
              </div>
            </div>
            {goals.map((goal) => {
              const effectiveDeadline =
                draftDeadlines[goal.id] ?? goal.deadline;
              const deadlineBoundaryIndex =
                resolveDeadlineBoundaryIndex(effectiveDeadline);
              const deadlineBoundaryPercent =
                (deadlineBoundaryIndex / visibleHorizonMonths) * 100;
              const earliestAchievableIso = unreachableByGoalId[goal.id];
              const isUnreachable =
                typeof earliestAchievableIso !== "undefined";
              const completedAtIso = completionByGoalId[goal.id];
              const canBeCompletedEarlier =
                !isUnreachable &&
                typeof completedAtIso === "string" &&
                monthDiff(
                  parseMonthStart(effectiveDeadline),
                  parseMonthStart(completedAtIso),
                ) > 0;
              const canApplyAchievableDate =
                Boolean(earliestAchievableIso) &&
                !isRecalculating &&
                !areGoalActionsDisabled &&
                goal.status === "active";
              const canApplyEarlierDate =
                Boolean(completedAtIso) &&
                canBeCompletedEarlier &&
                !isRecalculating &&
                !areGoalActionsDisabled &&
                goal.status === "active";

              return (
                <div
                  key={goal.id}
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
                                toDeadlineString(
                                  parseMonthStart(earliestAchievableIso),
                                ),
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
                    {canBeCompletedEarlier ? (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <p className="text-xs text-amber-700 dark:text-amber-400">
                          Can be completed earlier:{" "}
                          {formatAchievableMonth(completedAtIso)}
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
                        className={`h-full rounded-sm transition-colors ${
                          isUnreachable
                            ? "bg-destructive/70"
                            : canBeCompletedEarlier
                              ? "bg-amber-500/75"
                              : "bg-primary/80"
                        }`}
                        style={{ width: `${deadlineBoundaryPercent}%` }}
                      />
                    </div>
                    <button
                      type="button"
                      className="absolute inset-y-px h-5 w-2.5 -translate-x-1/2 cursor-ew-resize rounded-sm border bg-background shadow-sm ring-offset-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed"
                      style={{ left: `${deadlineBoundaryPercent}%` }}
                      onPointerDown={handleDragStart(goal.id)}
                      disabled={isRecalculating || goal.status !== "active"}
                      aria-label={`Resize deadline for ${goal.name}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Drag the handle at the end of each goal bar. Press Esc to rollback
          drag preview.
        </p>
      </CardContent>
    </Card>
  );
};
