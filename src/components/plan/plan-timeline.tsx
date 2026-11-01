"use client";
/* eslint-disable max-lines-per-function */

import { Keyboard, Plus } from "lucide-react";
import { type PointerEvent, useEffect, useMemo, useRef } from "react";

import {
  addMonths,
  monthDiff,
  parseMonthStart,
  toDeadlineString,
} from "@/components/plan/goal-status";
import {
  buildGoalTimelineRowState,
  PlanTimelineGoalRow,
  type TimelineGoal,
} from "@/components/plan/plan-timeline-goal-row";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PlanTimelineProps = {
  goals: TimelineGoal[];
  startMonthIso: string;
  horizonMonths: number;
  unreachableByGoalId: Record<string, string | null>;
  earlierDeadlineByGoalId: Record<string, string | null>;
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
const INFO_COLUMN_WIDTH = 280;
const MIN_VISIBLE_MONTHS = 60;
const MAX_VISIBLE_MONTHS = 240;
const EXTRA_VISIBLE_MONTHS_BUFFER = 6;

const formatMonthTick = (value: Date): string =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    timeZone: "UTC",
  }).format(value);

export const PlanTimeline = ({
  goals,
  startMonthIso,
  horizonMonths,
  unreachableByGoalId,
  earlierDeadlineByGoalId,
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
    const timelineStartX = rect.left + INFO_COLUMN_WIDTH;
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

  const createGoalButton = (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      className="rounded-full"
      onClick={onOpenCreateGoal}
      disabled={areGoalActionsDisabled}
      aria-label="Create goal"
    >
      <Plus aria-hidden="true" />
      New goal
    </Button>
  );

  if (goals.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-[20px] border-2 border-dashed border-border/80 px-6 py-10 text-center">
        <p className="text-sm font-semibold">No goals to display.</p>
        <p className="text-sm text-muted-foreground">
          Create your first goal to see deadlines and monthly contributions.
        </p>
        {createGoalButton}
      </div>
    );
  }

  const gridTemplateColumns = `${INFO_COLUMN_WIDTH}px ${visibleHorizonMonths * MONTH_WIDTH}px`;
  const yearStartIndexes = monthTicks
    .map((tick, index) => (tick.getUTCMonth() === 0 && index > 0 ? index : -1))
    .filter((index) => index > 0);

  return (
    <div className="min-w-0 overflow-hidden rounded-[20px] border bg-card">
      <div className="overflow-x-auto overscroll-x-none">
        <div
          ref={railRef}
          className="relative max-lg:min-w-0!"
          style={{
            minWidth: `${INFO_COLUMN_WIDTH + visibleHorizonMonths * MONTH_WIDTH}px`,
          }}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 hidden lg:block"
            style={{
              left: INFO_COLUMN_WIDTH,
              width: visibleHorizonMonths * MONTH_WIDTH,
            }}
          >
            <div
              className="absolute inset-y-0 left-0 bg-primary/[0.06]"
              style={{ width: MONTH_WIDTH }}
            />
            {yearStartIndexes.map((index) => (
              <div
                key={index}
                className="absolute inset-y-0 border-l border-border/70"
                style={{ left: index * MONTH_WIDTH }}
              />
            ))}
          </div>
          <div
            className="sticky top-0 z-20 hidden border-b bg-card lg:grid"
            style={{ gridTemplateColumns }}
          >
            <div className="sticky left-0 z-10 flex items-end border-r border-border/60 bg-card px-4 pb-2 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
              Goal
            </div>
            <div
              className="grid pt-2"
              style={{
                gridTemplateColumns: `repeat(${visibleHorizonMonths}, ${MONTH_WIDTH}px)`,
              }}
            >
              {monthTicks.map((tick, index) => {
                const isYearStart = index === 0 || tick.getUTCMonth() === 0;
                return (
                  <div key={tick.toISOString()} className="relative pb-2">
                    <span
                      className={cn(
                        "block h-4 px-1.5 text-[11px] font-semibold text-foreground",
                        !isYearStart && "invisible",
                      )}
                    >
                      {tick.getUTCFullYear()}
                    </span>
                    <span
                      className={cn(
                        "block text-center text-[11px]",
                        index === 0
                          ? "font-semibold text-primary"
                          : "text-muted-foreground",
                      )}
                    >
                      {index === 0 ? "Now" : formatMonthTick(tick)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          {goals.map((goal) => (
            <PlanTimelineGoalRow
              key={goal.id}
              goal={goal}
              rowState={buildGoalTimelineRowState({
                goal,
                draftDeadlines,
                unreachableByGoalId,
                earlierDeadlineByGoalId,
                isRecalculating,
                areGoalActionsDisabled,
                visibleHorizonMonths,
                resolveDeadlineBoundaryIndex,
              })}
              gridTemplateColumns={gridTemplateColumns}
              startMonthIso={startMonthIso}
              isRecalculating={isRecalculating}
              areGoalActionsDisabled={areGoalActionsDisabled}
              onOpenEditGoal={onOpenEditGoal}
              onOpenDeleteGoal={onOpenDeleteGoal}
              onDeadlineCommit={onDeadlineCommit}
              onDragStart={handleDragStart}
            />
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-4 py-3">
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Keyboard className="hidden size-3.5 lg:block" aria-hidden="true" />
          <span className="lg:hidden">Open a goal to change its deadline.</span>
          <span className="hidden lg:inline">
            Drag a deadline handle or focus it and use ← →. Esc cancels a drag.
            Dashed line marks the suggested date.
          </span>
        </p>
        {createGoalButton}
      </div>
    </div>
  );
};
