"use client";

import { CircleHelp, X } from "lucide-react";
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
import { formatAmount } from "@/lib/formatting/currency";

type BudgetSummary = {
  plannedIncome: number;
  obligations: number;
  available: number;
  obligationBreakdown: Array<{
    categoryId: string;
    categoryName: string;
    amount: number;
  }>;
};

type PlanHeaderProps = {
  budget: BudgetSummary;
  readyToAssign: number;
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

const ObligationBreakdownDialog = ({
  items,
  isOpen,
  onClose,
}: {
  items: BudgetSummary["obligationBreakdown"];
  isOpen: boolean;
  onClose: () => void;
}) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Obligations breakdown"
      tabIndex={-1}
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onClose();
        }
      }}
    >
      <Card
        className="max-h-[80vh] w-full max-w-lg overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <CardHeader className="gap-2 border-b">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm">Obligations breakdown</CardTitle>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Close obligations breakdown"
              onClick={onClose}
            >
              <X className="size-3.5" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Includes only categories with YNAB goal/target; values are averaged
            assigned amounts from recent months.
          </p>
        </CardHeader>
        <CardContent className="space-y-2 overflow-y-auto py-3">
          {items.length > 0 ? (
            <ul className="space-y-1">
              {items.map((item) => (
                <li
                  key={item.categoryId}
                  className="flex items-center justify-between gap-3 rounded-md border px-2 py-1.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-foreground">
                      {item.categoryName}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {item.categoryId}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold">
                    {formatAmount(item.amount)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              No categories currently contribute to obligations.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export const PlanHeader = ({
  budget,
  readyToAssign,
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
  const [isBreakdownModalOpen, setIsBreakdownModalOpen] = useState(false);

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
    <Card>
      <CardHeader className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-base font-semibold">
            Plan overview
          </CardTitle>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Monthly budget driving your goal allocations.
          </p>
        </div>
        <CardAction className="w-full sm:w-auto">
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={isImportDisabled}
              aria-label="Import latest categories and income from YNAB"
              onClick={() => void onSyncYnab()}
            >
              {importButtonLabel}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
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
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-[10px] bg-background/60 px-4 py-4">
            <dt className="text-xs font-medium text-muted-foreground">
              Planned income
            </dt>
            <dd className="mt-2 font-mono text-xl font-medium tracking-[-0.025em] tabular-nums">
              {formatAmount(budget.plannedIncome)}
            </dd>
          </div>
          <div className="rounded-[10px] bg-background/60 px-4 py-4">
            <dt className="text-xs font-medium text-muted-foreground">
              Obligations
            </dt>
            <dd className="mt-1 flex items-center justify-between gap-2">
              <span className="font-mono text-xl font-medium tracking-[-0.025em] tabular-nums">
                {formatAmount(budget.obligations)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Open obligations breakdown"
                onClick={() => setIsBreakdownModalOpen(true)}
              >
                <CircleHelp className="size-4 text-muted-foreground" />
              </Button>
            </dd>
          </div>
          <div className="rounded-[10px] border border-primary/20 bg-accent/60 px-4 py-4">
            <dt className="text-xs font-medium text-accent-foreground/75">
              Available for goals
            </dt>
            <dd className="mt-2 font-mono text-xl font-medium tracking-[-0.025em] text-primary tabular-nums">
              {formatAmount(budget.available)}
            </dd>
          </div>
          <div className="rounded-[10px] bg-background/60 px-4 py-4">
            <dt className="text-xs font-medium text-muted-foreground">
              Ready to Assign
            </dt>
            <dd className="mt-2 font-mono text-xl font-medium tracking-[-0.025em] tabular-nums">
              {formatAmount(readyToAssign)}
            </dd>
            <dd className="mt-1 text-xs text-muted-foreground">
              Free YNAB money this month
            </dd>
          </div>
        </dl>

        {needsSync ? (
          <Alert className="border-warning/30 bg-warning/5 py-3">
            <AlertTitle className="text-warning">
              YNAB sync recommended
            </AlertTitle>
            <AlertDescription>
              Cached YNAB data is stale. Import the latest data, then
              recalculate if needed.
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
      <ObligationBreakdownDialog
        items={budget.obligationBreakdown}
        isOpen={isBreakdownModalOpen}
        onClose={() => setIsBreakdownModalOpen(false)}
      />
    </Card>
  );
};
