"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

const formatMonth = (value: string): string => {
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

export const PlanConflicts = ({
  conflicts,
  tbdWarnings,
}: PlanConflictsProps) => {
  if (conflicts.length === 0 && tbdWarnings.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Conflicts and warnings</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No conflicts detected.
          </p>
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
                    ? `Earliest achievable month: ${formatMonth(conflict.earliestAchievable)}.`
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
                {formatMonth(conflict.deadline)}. {conflict.detail}
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
