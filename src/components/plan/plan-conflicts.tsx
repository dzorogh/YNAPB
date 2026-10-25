"use client";

import { CheckCircle2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMonthLabel } from "@/lib/formatting/month-label";

type UnreachableConflict = {
  type: "unreachable";
  goalId: string;
  earliestAchievable: string | null;
  detail: string;
};

type TiedDeadlineConflict = {
  type: "tied_deadline";
  goalIds: string[];
  deadline: string;
  detail: string;
};

type PlanConflict = UnreachableConflict | TiedDeadlineConflict;

type TbdWarning = {
  categoryId: string;
  categoryName: string;
};

type PlanConflictsProps = {
  conflicts: PlanConflict[];
  tbdWarnings: TbdWarning[];
};

export const PlanConflicts = ({
  conflicts,
  tbdWarnings,
}: PlanConflictsProps) => {
  if (conflicts.length === 0 && tbdWarnings.length === 0) {
    return (
      <Card size="sm">
        <CardContent className="flex items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
            <CheckCircle2 className="size-4" aria-hidden="true" />
          </span>
          <div>
            <CardTitle className="text-sm">Conflicts and warnings</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              No conflicts detected. Your current plan is internally consistent.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Conflicts and warnings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {conflicts.map((conflict) => {
          if (conflict.type === "unreachable") {
            return (
              <Alert
                key={`unreachable-${conflict.goalId}`}
                variant="destructive"
              >
                <AlertTitle>Unreachable goal: {conflict.goalId}</AlertTitle>
                <AlertDescription>
                  {conflict.earliestAchievable
                    ? `Earliest achievable month: ${formatMonthLabel(conflict.earliestAchievable)}.`
                    : "No achievable month detected within calculation horizon."}{" "}
                  {conflict.detail}
                </AlertDescription>
              </Alert>
            );
          }

          return (
            <Alert key={`tied-deadline-${conflict.goalIds.join("-")}`}>
              <AlertTitle>Tied deadline conflict</AlertTitle>
              <AlertDescription>
                Goals {conflict.goalIds.join(", ")} share deadline{" "}
                {formatMonthLabel(conflict.deadline)}. {conflict.detail}
              </AlertDescription>
            </Alert>
          );
        })}

        {tbdWarnings.map((warning) => (
          <Alert key={`tbd-${warning.categoryId}`}>
            <AlertTitle>TBD category is not linked</AlertTitle>
            <AlertDescription>
              Category "{warning.categoryName}" has TBD goal type but is not
              linked to an active goal.
            </AlertDescription>
          </Alert>
        ))}
      </CardContent>
    </Card>
  );
};
