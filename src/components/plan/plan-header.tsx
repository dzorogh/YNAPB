"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type BudgetSummary = {
  plannedIncome: number;
  obligations: number;
  available: number;
};

type PlanHeaderProps = {
  budget: BudgetSummary;
  needsSync: boolean;
  isRefreshing: boolean;
  onRefresh: () => Promise<void>;
};

const formatCurrency = (value: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);

export const PlanHeader = ({
  budget,
  needsSync,
  isRefreshing,
  onRefresh,
}: PlanHeaderProps) => (
  <Card>
    <CardHeader className="space-y-1">
      <CardTitle>Plan overview</CardTitle>
      <p className="text-sm text-muted-foreground">
        Monthly budget is used to calculate allocations and detect conflicts.
      </p>
    </CardHeader>
    <CardContent className="space-y-4">
      <dl className="grid gap-2 text-sm sm:grid-cols-3">
        <div className="rounded-md border p-3">
          <dt className="text-muted-foreground">Planned income</dt>
          <dd className="text-base font-medium">{formatCurrency(budget.plannedIncome)}</dd>
        </div>
        <div className="rounded-md border p-3">
          <dt className="text-muted-foreground">Obligations</dt>
          <dd className="text-base font-medium">{formatCurrency(budget.obligations)}</dd>
        </div>
        <div className="rounded-md border p-3">
          <dt className="text-muted-foreground">Available for goals</dt>
          <dd className="text-base font-medium">{formatCurrency(budget.available)}</dd>
        </div>
      </dl>

      {needsSync ? (
        <Alert>
          <AlertTitle>YNAB sync recommended</AlertTitle>
          <AlertDescription>
            Cached YNAB data is stale. Run sync in settings to get fresher calculations.
          </AlertDescription>
        </Alert>
      ) : null}

      <Button
        type="button"
        variant="outline"
        disabled={isRefreshing}
        aria-label="Refresh plan calculation"
        onClick={() => void onRefresh()}
      >
        {isRefreshing ? "Refreshing..." : "Refresh plan"}
      </Button>
    </CardContent>
  </Card>
);
