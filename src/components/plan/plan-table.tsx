"use client";

import { Fragment } from "react";

import { formatAmount } from "@/lib/formatting/currency";
import { cn } from "@/lib/utils";

type PlanAllocation = {
  month: string;
  perGoal: Record<string, number>;
  unallocated: number;
};

type PlanTableProps = {
  allocations: PlanAllocation[];
  goals: Array<{ id: string; name: string; deadline: string }>;
};

const GOAL_SWATCHES = [
  "bg-chart-1",
  "bg-chart-2",
  "bg-chart-3",
  "bg-success",
  "bg-chart-5",
  "bg-chart-4",
];

const swatchFor = (index: number): string =>
  GOAL_SWATCHES[index % GOAL_SWATCHES.length] ?? "bg-chart-1";

const formatMonthName = (value: Date): string =>
  new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(
    value,
  );

const AmountCell = ({
  value,
  className,
}: {
  value: number;
  className?: string;
}) => (
  <td
    className={cn(
      "h-10 px-4 text-right text-[13px] whitespace-nowrap tabular-nums",
      value === 0 ? "text-muted-foreground/50" : "text-foreground",
      className,
    )}
  >
    {value === 0 ? "—" : formatAmount(value)}
  </td>
);

const SectionTitle = () => (
  <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4 pb-3">
    <h3 className="text-sm font-semibold">Monthly allocation</h3>
    <p className="text-xs text-muted-foreground">
      Contributions per goal by month, with money left unallocated.
    </p>
  </div>
);

export const PlanTable = ({ allocations, goals }: PlanTableProps) => {
  const latestDeadline = goals.reduce<number | null>((latest, goal) => {
    const parsed = Date.parse(`${goal.deadline.slice(0, 7)}-01T00:00:00.000Z`);
    if (Number.isNaN(parsed)) {
      return latest;
    }
    return latest === null || parsed > latest ? parsed : latest;
  }, null);

  const visibleRows =
    latestDeadline === null
      ? allocations
      : allocations.filter((row) => {
          const rowMonth = Date.parse(row.month);
          return !Number.isNaN(rowMonth) && rowMonth <= latestDeadline;
        });

  if (goals.length === 0 || visibleRows.length === 0) {
    return (
      <div className="rounded-[20px] border bg-card">
        <SectionTitle />
        <p className="px-4 pb-5 text-sm text-muted-foreground">
          No allocation rows yet.
        </p>
      </div>
    );
  }

  const totals = goals.map((goal) =>
    visibleRows.reduce((sum, row) => sum + (row.perGoal[goal.id] ?? 0), 0),
  );
  const totalUnallocated = visibleRows.reduce(
    (sum, row) => sum + row.unallocated,
    0,
  );

  return (
    <div className="min-w-0 overflow-hidden rounded-[20px] border bg-card">
      <SectionTitle />
      <div className="overflow-x-auto border-t">
        <table className="w-full min-w-[720px] border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 h-11 border-b bg-card px-4 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
                Month
              </th>
              {goals.map((goal, index) => (
                <th
                  key={goal.id}
                  className="h-11 max-w-44 border-b px-4 text-right text-xs font-medium text-muted-foreground"
                >
                  <span className="inline-flex max-w-full items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        swatchFor(index),
                      )}
                    />
                    <span className="truncate">{goal.name}</span>
                  </span>
                </th>
              ))}
              <th className="h-11 border-b px-4 text-right text-xs font-medium text-muted-foreground">
                Unallocated
              </th>
              <th className="h-11 w-40 border-b px-4 text-xs font-medium text-muted-foreground">
                <span className="sr-only">Distribution</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, rowIndex) => {
              const month = new Date(row.month);
              const isYearStart = rowIndex === 0 || month.getUTCMonth() === 0;
              const amounts = goals.map((goal) => row.perGoal[goal.id] ?? 0);
              const rowTotal =
                amounts.reduce((sum, value) => sum + value, 0) +
                Math.max(row.unallocated, 0);

              return (
                <Fragment key={row.month}>
                  {isYearStart ? (
                    <tr>
                      <td
                        colSpan={goals.length + 3}
                        className="sticky left-0 border-b bg-muted/30 px-4 py-1.5 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground"
                      >
                        {month.getUTCFullYear()}
                      </td>
                    </tr>
                  ) : null}
                  <tr className="group/row transition-colors hover:bg-muted/25">
                    <td
                      className={cn(
                        "sticky left-0 z-10 h-10 border-b border-border/50 bg-card px-4 font-medium whitespace-nowrap group-hover/row:bg-[color-mix(in_oklab,var(--card),var(--muted)_25%)]",
                        rowIndex === 0 && "text-primary",
                      )}
                    >
                      {formatMonthName(month)}
                      {rowIndex === 0 ? (
                        <span className="ml-2 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold">
                          Now
                        </span>
                      ) : null}
                    </td>
                    {amounts.map((value, index) => (
                      <AmountCell
                        key={goals[index]?.id ?? index}
                        value={value}
                        className="border-b border-border/50"
                      />
                    ))}
                    <AmountCell
                      value={row.unallocated}
                      className={cn(
                        "border-b border-border/50",
                        row.unallocated > 0 && "text-primary",
                      )}
                    />
                    <td className="h-10 border-b border-border/50 px-4">
                      <div
                        className="flex h-2 w-32 overflow-hidden rounded-full bg-muted"
                        aria-hidden="true"
                      >
                        {rowTotal > 0
                          ? amounts.map((value, index) =>
                              value > 0 ? (
                                <span
                                  key={goals[index]?.id ?? index}
                                  className={swatchFor(index)}
                                  style={{
                                    width: `${(value / rowTotal) * 100}%`,
                                  }}
                                />
                              ) : null,
                            )
                          : null}
                      </div>
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-muted/30 font-semibold">
              <td className="sticky left-0 z-10 h-10 bg-[color-mix(in_oklab,var(--card),var(--muted)_30%)] px-4 text-xs tracking-[0.06em] text-muted-foreground uppercase">
                Total
              </td>
              {totals.map((value, index) => (
                <AmountCell key={goals[index]?.id ?? index} value={value} />
              ))}
              <AmountCell value={totalUnallocated} />
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};
