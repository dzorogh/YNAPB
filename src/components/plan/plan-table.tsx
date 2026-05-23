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
        <CardTitle>Monthly allocation</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-3 font-medium">Month</th>
                {goalIds.map((goalId) => (
                  <th key={goalId} className="py-2 pr-3 font-medium">
                    {goalsById.get(goalId) ?? goalId}
                  </th>
                ))}
                <th className="py-2 font-medium">Unallocated</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.month} className="border-b last:border-b-0">
                  <td className="py-2 pr-3">{formatMonthLabel(row.month)}</td>
                  {goalIds.map((goalId) => (
                    <td key={`${row.month}-${goalId}`} className="py-2 pr-3">
                      {formatAmount(row.perGoal[goalId] ?? 0)}
                    </td>
                  ))}
                  <td className="py-2">{formatAmount(row.unallocated)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
};
