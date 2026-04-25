"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatting/currency";

type BudgetSummary = {
  plannedIncome: number;
  obligations: number;
  available: number;
};

type PlanHeaderProps = {
  budget: BudgetSummary;
  currencyCode: string;
  needsSync: boolean;
  isRefreshing: boolean;
  isPreviewLoading: boolean;
  isApplyingPush: boolean;
  onRefresh: () => Promise<void>;
  onOpenPushPreview: () => Promise<void>;
};

export const PlanHeader = ({
  budget,
  currencyCode,
  needsSync,
  isRefreshing,
  isPreviewLoading,
  isApplyingPush,
  onRefresh,
  onOpenPushPreview,
}: PlanHeaderProps) => (
  <Card size="sm">
    <CardHeader className="gap-2 border-b">
      <CardTitle className="text-sm">Plan overview</CardTitle>
      <CardAction>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isRefreshing}
            aria-label="Refresh plan calculation"
            onClick={() => void onRefresh()}
          >
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={isPreviewLoading || isApplyingPush}
            aria-label="Push goals to YNAB for current month"
            onClick={() => void onOpenPushPreview()}
          >
            {isPreviewLoading ? "Preparing..." : "Push to YNAB"}
          </Button>
        </div>
      </CardAction>
      <p className="text-xs text-muted-foreground">
        Budget values drive allocation and conflict detection.
      </p>
    </CardHeader>
    <CardContent className="space-y-3">
      <dl className="grid gap-2 text-xs sm:grid-cols-3">
        <div className="rounded-md border px-3 py-2">
          <dt className="text-muted-foreground">Planned income</dt>
          <dd className="text-sm font-semibold">
            {formatCurrency(budget.plannedIncome, currencyCode)}
          </dd>
        </div>
        <div className="rounded-md border px-3 py-2">
          <dt className="text-muted-foreground">Obligations</dt>
          <dd className="text-sm font-semibold">
            {formatCurrency(budget.obligations, currencyCode)}
          </dd>
        </div>
        <div className="rounded-md border px-3 py-2">
          <dt className="text-muted-foreground">Available for goals</dt>
          <dd className="text-sm font-semibold">
            {formatCurrency(budget.available, currencyCode)}
          </dd>
        </div>
      </dl>

      {needsSync ? (
        <Alert className="py-2">
          <AlertTitle>YNAB sync recommended</AlertTitle>
          <AlertDescription>
            Cached YNAB data is stale. Run sync in settings to get fresher
            calculations.
          </AlertDescription>
        </Alert>
      ) : null}
    </CardContent>
  </Card>
);
