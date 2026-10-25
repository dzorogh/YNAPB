"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAmount } from "@/lib/formatting/currency";
import { formatMonthLabel } from "@/lib/formatting/month-label";

type PlanAllocation = {
  month: string;
  perGoal: Record<string, number>;
  unallocated: number;
};

type PlanTableProps = {
  allocations: PlanAllocation[];
  goals: Array<{ id: string; name: string; deadline: string }>;
};

export const PlanTable = ({ allocations, goals }: PlanTableProps) => {
  const goalIds = goals.map((goal) => goal.id);
  const goalsById = new Map(goals.map((goal) => [goal.id, goal.name]));
  const latestDeadlineMonthStart = goals.reduce<Date | null>((latest, goal) => {
    const parsed = new Date(`${goal.deadline.slice(0, 7)}-01T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
      return latest;
    }
    if (!latest || parsed.getTime() > latest.getTime()) {
      return parsed;
    }
    return latest;
  }, null);

  const visibleRows = latestDeadlineMonthStart
    ? allocations.filter((row) => {
        const rowMonth = new Date(row.month);
        if (Number.isNaN(rowMonth.getTime())) {
          return false;
        }
        return rowMonth.getTime() <= latestDeadlineMonthStart.getTime();
      })
    : allocations;

  if (goals.length === 0 || visibleRows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Monthly allocation</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No allocation rows yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">
          Monthly allocation
        </CardTitle>
        <p className="text-xs leading-5 text-muted-foreground">
          Calculated contributions by month, with any money left unallocated.
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-[10px] border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-muted/60">
              <tr className="border-b">
                <th className="h-11 px-4 font-medium text-muted-foreground">
                  Month
                </th>
                {goalIds.map((goalId) => (
                  <th
                    key={goalId}
                    className="h-11 px-4 text-right font-medium text-muted-foreground"
                  >
                    {goalsById.get(goalId) ?? goalId}
                  </th>
                ))}
                <th className="h-11 px-4 text-right font-medium text-muted-foreground">
                  Unallocated
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr
                  key={row.month}
                  className="border-b transition-colors last:border-b-0 hover:bg-muted/25"
                >
                  <td className="h-11 px-4 font-medium">
                    {formatMonthLabel(row.month)}
                  </td>
                  {goalIds.map((goalId) => (
                    <td
                      key={`${row.month}-${goalId}`}
                      className="h-11 px-4 text-right font-mono text-[13px] tabular-nums"
                    >
                      {formatAmount(row.perGoal[goalId] ?? 0)}
                    </td>
                  ))}
                  <td className="h-11 px-4 text-right font-mono text-[13px] text-primary tabular-nums">
                    {formatAmount(row.unallocated)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
};
