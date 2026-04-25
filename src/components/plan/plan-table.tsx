"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type PlanAllocation = {
  month: string;
  perGoal: Record<string, number>;
  unallocated: number;
};

type PlanTableProps = {
  allocations: PlanAllocation[];
  goalIds: string[];
};

const formatCurrency = (value: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);

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

export const PlanTable = ({ allocations, goalIds }: PlanTableProps) => {
  const visibleRows = allocations.slice(0, 12);

  if (goalIds.length === 0 || visibleRows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Monthly allocation</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No allocation rows yet.</p>
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
                    {goalId}
                  </th>
                ))}
                <th className="py-2 font-medium">Unallocated</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.month} className="border-b last:border-b-0">
                  <td className="py-2 pr-3">{formatMonth(row.month)}</td>
                  {goalIds.map((goalId) => (
                    <td key={`${row.month}-${goalId}`} className="py-2 pr-3">
                      {formatCurrency(row.perGoal[goalId] ?? 0)}
                    </td>
                  ))}
                  <td className="py-2">{formatCurrency(row.unallocated)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
};
