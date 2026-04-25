"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type PlanTimelineProps = {
  goalIds: string[];
  completionMap: Record<string, string | null>;
  unreachableGoalIds: Set<string>;
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
            return (
              <li
                key={goalId}
                className="flex items-center justify-between rounded-md border px-3 py-2"
              >
                <span className="font-medium">{goalId}</span>
                <span className={isUnreachable ? "text-destructive" : "text-muted-foreground"}>
                  {isUnreachable ? "Unreachable" : formatMonth(completionMap[goalId] ?? null)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </CardContent>
  </Card>
);
