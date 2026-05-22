"use client";

import { useEffect, useState } from "react";

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
  isSyncingYnab: boolean;
  ynabImportBlockedUntil: number | null;
  isPreviewLoading: boolean;
  isApplyingPush: boolean;
  onRefresh: () => Promise<void>;
  onSyncYnab: () => Promise<void>;
  onOpenPushPreview: () => Promise<void>;
};

const resolveImportCooldownSeconds = (
  blockedUntil: number | null,
  now: number,
): number => {
  if (blockedUntil === null || now >= blockedUntil) {
    return 0;
  }
  return Math.ceil((blockedUntil - now) / 1000);
};

export const PlanHeader = ({
  budget,
  currencyCode,
  needsSync,
  isRefreshing,
  isSyncingYnab,
  ynabImportBlockedUntil,
  isPreviewLoading,
  isApplyingPush,
  onRefresh,
  onSyncYnab,
  onOpenPushPreview,
}: PlanHeaderProps) => {
  const [importCooldownSeconds, setImportCooldownSeconds] = useState(0);

  useEffect(() => {
    const updateCooldown = () => {
      setImportCooldownSeconds(
        resolveImportCooldownSeconds(ynabImportBlockedUntil, Date.now()),
      );
    };

    updateCooldown();
    if (ynabImportBlockedUntil === null) {
      return;
    }

    const intervalId = window.setInterval(updateCooldown, 1000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [ynabImportBlockedUntil]);

  const isImportCooldownActive = importCooldownSeconds > 0;
  const isImportDisabled =
    isSyncingYnab || isRefreshing || isImportCooldownActive;

  const importButtonLabel = isSyncingYnab
    ? "Importing..."
    : isImportCooldownActive
      ? `Wait ${importCooldownSeconds}s`
      : "Import from YNAB";

  return (
    <Card size="sm">
      <CardHeader className="gap-2 border-b">
        <CardTitle className="text-sm">Plan overview</CardTitle>
        <CardAction>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isImportDisabled}
              aria-label="Import latest categories and income from YNAB"
              onClick={() => void onSyncYnab()}
            >
              {importButtonLabel}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isRefreshing || isSyncingYnab}
              aria-label="Recalculate plan from cached YNAB data"
              onClick={() => void onRefresh()}
            >
              {isRefreshing ? "Recalculating..." : "Recalculate"}
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
              Cached YNAB data is stale. Use Import from YNAB, then Recalculate
              if needed.
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
};
