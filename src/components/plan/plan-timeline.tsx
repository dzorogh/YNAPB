"use client";
/* eslint-disable max-lines-per-function */

import { useEffect, useMemo, useRef, type PointerEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildGoalTimelineRowState,
  PlanTimelineGoalRow,
  type TimelineGoal,
} from "@/components/plan/plan-timeline-goal-row";

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
            {goals.map((goal) => (
              <PlanTimelineGoalRow
                key={goal.id}
                goal={goal}
                rowState={buildGoalTimelineRowState({
                  goal,
                  draftDeadlines,
                  unreachableByGoalId,
                  completionByGoalId,
                  isRecalculating,
                  areGoalActionsDisabled,
                  visibleHorizonMonths,
                  resolveDeadlineBoundaryIndex,
                })}
                visibleHorizonMonths={visibleHorizonMonths}
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
        <p className="text-xs text-muted-foreground">
          Drag the handle at the end of each goal bar. Press Esc to rollback
          drag preview.
        </p>
      </CardContent>
    </Card>
  );
};
