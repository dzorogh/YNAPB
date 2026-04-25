"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type PlanTimelineProps = {
  goalIds: string[];
  completionMap: Record<string, string | null>;
  unreachableGoalIds: Set<string>;
  deadlineShifts: Record<string, number>;
  isRecalculating: boolean;
  onShiftDeadline: (goalId: string, deltaMonths: number) => void;
};

const formatMonth = (value: string | null): string => {
  if (!value) {
    return "Not completed";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
};

export const PlanTimeline = ({
  goalIds,
  completionMap,
  unreachableGoalIds,
  deadlineShifts,
  isRecalculating,
  onShiftDeadline,
}: PlanTimelineProps) => (
  <Card>
    <CardHeader>
      <CardTitle>Timeline</CardTitle>
    </CardHeader>
    <CardContent>
      {goalIds.length === 0 ? (
        <p className="text-sm text-muted-foreground">No goals to display.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {goalIds.map((goalId) => {
            const isUnreachable = unreachableGoalIds.has(goalId);
            const shiftMonths = deadlineShifts[goalId] ?? 0;
            const shiftLabel = shiftMonths === 0
              ? "No shift"
              : `${shiftMonths > 0 ? "+" : ""}${shiftMonths} month${Math.abs(shiftMonths) === 1 ? "" : "s"}`;
            return (
              <li
                key={goalId}
                className="flex items-center justify-between rounded-md border px-3 py-2 gap-2"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{goalId}</p>
                  <p className="text-xs text-muted-foreground">{shiftLabel}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded border px-2 py-1 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => onShiftDeadline(goalId, -1)}
                    disabled={isRecalculating}
                    aria-label={`Move ${goalId} deadline one month earlier`}
                  >
                    -1 month
                  </button>
                  <button
                    type="button"
                    className="rounded border px-2 py-1 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => onShiftDeadline(goalId, 1)}
                    disabled={isRecalculating}
                    aria-label={`Move ${goalId} deadline one month later`}
                  >
                    +1 month
                  </button>
                  <span className={isUnreachable ? "text-destructive" : "text-muted-foreground"}>
                    {isUnreachable ? "Unreachable" : formatMonth(completionMap[goalId] ?? null)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </CardContent>
  </Card>
);
