"use client";

import { ChevronRight, RefreshCw, Send, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAmount } from "@/lib/formatting/currency";
import { cn } from "@/lib/utils";

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

export type HorizonGoal = {
  id: string;
  name: string;
  monthsToDeadline: number;
  isUnreachable: boolean;
};

type PlanSidePanelProps = {
  budget: BudgetSummary;
  horizonGoals: HorizonGoal[];
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

const useImportCooldownSeconds = (blockedUntil: number | null): number => {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const updateCooldown = () => {
      setSeconds(resolveImportCooldownSeconds(blockedUntil, Date.now()));
    };

    updateCooldown();
    if (blockedUntil === null) {
      return;
    }

    const intervalId = window.setInterval(updateCooldown, 1000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [blockedUntil]);

  return seconds;
};

const panelClassName = "gap-0 rounded-[20px] py-5";

const BudgetRow = ({
  label,
  value,
  emphasis = false,
}: {
  label: React.ReactNode;
  value: string;
  emphasis?: boolean;
}) => (
  <div
    className={cn(
      "flex items-center justify-between gap-3 py-1.5 text-sm",
      emphasis
        ? "mt-1 border-t pt-3 font-medium text-foreground"
        : "text-muted-foreground",
    )}
  >
    <dt>{label}</dt>
    <dd
      className={cn(
        "tabular-nums",
        emphasis ? "text-primary" : "text-foreground",
      )}
    >
      {value}
    </dd>
  </div>
);

const HorizonPanel = ({ goals }: { goals: HorizonGoal[] }) => {
  if (goals.length === 0) {
    return null;
  }
  const maxMonths = Math.max(...goals.map((goal) => goal.monthsToDeadline), 1);
  const sorted = [...goals].sort(
    (left, right) => left.monthsToDeadline - right.monthsToDeadline,
  );

  return (
    <Card className={panelClassName}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">Horizon</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2.5">
          {sorted.map((goal) => (
            <li
              key={goal.id}
              className="grid grid-cols-[88px_1fr] items-center gap-2 text-xs text-muted-foreground"
            >
              <span className="truncate" title={goal.name}>
                {goal.name}
              </span>
              <span
                className="h-2 overflow-hidden rounded-full bg-muted"
                title={`${goal.monthsToDeadline} months`}
              >
                <span
                  className={cn(
                    "block h-full rounded-full",
                    goal.isUnreachable ? "bg-destructive/80" : "bg-primary/80",
                  )}
                  style={{
                    width: `${Math.max(4, (goal.monthsToDeadline / maxMonths) * 100)}%`,
                  }}
                />
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 flex justify-between pl-[96px] text-[11px] text-muted-foreground/80">
          <span>now</span>
          <span>{maxMonths} mo</span>
        </p>
      </CardContent>
    </Card>
  );
};

export const PlanSidePanel = ({
  budget,
  horizonGoals,
  needsSync,
  isRefreshing,
  isSyncingYnab,
  ynabImportBlockedUntil,
  isPreviewLoading,
  isApplyingPush,
  onRefresh,
  onSyncYnab,
  onOpenPushPreview,
}: PlanSidePanelProps) => {
  const importCooldownSeconds = useImportCooldownSeconds(
    ynabImportBlockedUntil,
  );
  const [isBreakdownModalOpen, setIsBreakdownModalOpen] = useState(false);

  const isImportCooldownActive = importCooldownSeconds > 0;
  const isImportDisabled =
    isSyncingYnab || isRefreshing || isImportCooldownActive;

  const importButtonLabel = isSyncingYnab
    ? "Importing..."
    : isImportCooldownActive
      ? `Wait ${importCooldownSeconds}s`
      : "Import from YNAB";

  const pushButton = (
    <Button
      type="button"
      size="lg"
      className="h-12 w-full rounded-[16px] text-[15px] font-semibold"
      disabled={isPreviewLoading || isApplyingPush}
      aria-label="Push goals to YNAB for current month"
      onClick={() => void onOpenPushPreview()}
    >
      <Send aria-hidden="true" />
      {isPreviewLoading ? "Preparing..." : "Push to YNAB"}
    </Button>
  );

  return (
    <aside
      aria-label="Plan summary and actions"
      className="flex flex-col gap-4 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto"
    >
      {needsSync ? (
        <Alert className="rounded-[16px] border-warning/30 bg-warning/5 py-3">
          <TriangleAlert className="text-warning" aria-hidden="true" />
          <AlertTitle className="text-warning">
            YNAB sync recommended
          </AlertTitle>
          <AlertDescription>
            Cached YNAB data is stale. Import the latest data, then recalculate
            if needed.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card className={panelClassName}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">
            Monthly budget
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl>
            <BudgetRow
              label="Planned income"
              value={formatAmount(budget.plannedIncome)}
            />
            <BudgetRow
              label={
                <button
                  type="button"
                  className="-ml-1 inline-flex items-center gap-0.5 rounded-md px-1 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Open obligations breakdown"
                  onClick={() => setIsBreakdownModalOpen(true)}
                >
                  Obligations
                  <ChevronRight className="size-3.5" aria-hidden="true" />
                </button>
              }
              value={`−${formatAmount(budget.obligations)}`}
            />
            <BudgetRow
              label="Available for goals"
              value={formatAmount(budget.available)}
              emphasis
            />
          </dl>
        </CardContent>
      </Card>

      <HorizonPanel goals={horizonGoals} />

      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={isImportDisabled}
            aria-label="Import latest categories and income from YNAB"
            onClick={() => void onSyncYnab()}
          >
            {importButtonLabel}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={isRefreshing || isSyncingYnab}
            aria-label="Recalculate plan from cached YNAB data"
            onClick={() => void onRefresh()}
          >
            <RefreshCw
              className={cn(isRefreshing && "animate-spin")}
              aria-hidden="true"
            />
            {isRefreshing ? "Recalculating..." : "Recalculate"}
          </Button>
        </div>
        <div className="hidden flex-col gap-2 lg:flex">
          {pushButton}
          <p className="text-center text-xs text-muted-foreground">
            You review every change before it is sent.
          </p>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
        {pushButton}
      </div>

      <ObligationBreakdownDialog
        items={budget.obligationBreakdown}
        isOpen={isBreakdownModalOpen}
        onClose={() => setIsBreakdownModalOpen(false)}
      />
    </aside>
  );
};
