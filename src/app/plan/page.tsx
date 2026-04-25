"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PlanConflicts } from "@/components/plan/plan-conflicts";
import { PlanHeader } from "@/components/plan/plan-header";
import { PlanTable } from "@/components/plan/plan-table";
import { PlanTimeline } from "@/components/plan/plan-timeline";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ApiPlanConflict =
  | {
      type: "unreachable";
      goalId: string;
      earliestAchievable: string | null;
      detail: string;
    }
  | {
      type: "tied_deadline";
      goalIds: string[];
      deadline: string;
      detail: string;
    };

type ApiPlanResponse = {
  budget: {
    plannedIncome: number;
    obligations: number;
    available: number;
  };
  planResult: {
    allocations: Array<{
      month: string;
      perGoal: Record<string, number>;
      unallocated: number;
    }>;
    conflicts: ApiPlanConflict[];
    completionMap: Record<string, string | null>;
    autoFrozenGoalIds: string[];
  };
  tbdWarnings: Array<{
    categoryId: string;
    categoryName: string;
  }>;
  needsSync: boolean;
};

type ApiErrorResponse = {
  error?: string;
};

type LoadState = "loading" | "ready" | "error";
type RefreshHandler = () => Promise<void>;

const extractGoalIds = (payload: ApiPlanResponse): string[] => {
  const ids = new Set<string>();

  Object.keys(payload.planResult.completionMap).forEach((goalId) => {
    ids.add(goalId);
  });

  payload.planResult.allocations.forEach((allocation) => {
    Object.keys(allocation.perGoal).forEach((goalId) => {
      ids.add(goalId);
    });
  });

  payload.planResult.conflicts.forEach((conflict) => {
    if (conflict.type === "unreachable") {
      ids.add(conflict.goalId);
      return;
    }
    conflict.goalIds.forEach((goalId) => ids.add(goalId));
  });

  return [...ids].sort((leftId, rightId) => leftId.localeCompare(rightId));
};

const isLikelyMissingYnabConnection = (payload: ApiPlanResponse): boolean => {
  const hasAnyGoalSignals = extractGoalIds(payload).length > 0;
  if (hasAnyGoalSignals) {
    return false;
  }

  const hasAnyTbdWarnings = payload.tbdWarnings.length > 0;
  if (hasAnyTbdWarnings) {
    return false;
  }

  if (!payload.needsSync) {
    return false;
  }

  return payload.budget.plannedIncome === 0 && payload.budget.obligations === 0;
};

const LoadingPlanState = () => (
  <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 md:p-8">
    <Card>
      <CardHeader>
        <CardTitle>Plan</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Loading plan...</p>
      </CardContent>
    </Card>
  </main>
);

const ErrorPlanState = ({
  statusMessage,
  onRetry,
}: {
  statusMessage: string | null;
  onRetry: RefreshHandler;
}) => (
  <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 md:p-8">
    <Alert variant="destructive">
      <AlertTitle>Failed to load plan</AlertTitle>
      <AlertDescription>{statusMessage ?? "Try again in a minute."}</AlertDescription>
    </Alert>
    <Button type="button" variant="outline" onClick={() => void onRetry()} aria-label="Retry loading plan">
      Retry
    </Button>
  </main>
);

const MissingConnectionPlanState = () => (
  <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 md:p-8">
    <Card>
      <CardHeader>
        <CardTitle>Connect YNAB first</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Plan requires YNAB connection and synced data before calculation can start.
        </p>
        <Button render={<Link href="/settings" />} aria-label="Go to settings">
          Open settings
        </Button>
      </CardContent>
    </Card>
  </main>
);

const EmptyGoalsPlanState = ({
  planData,
  isRefreshing,
  onRefresh,
}: {
  planData: ApiPlanResponse;
  isRefreshing: boolean;
  onRefresh: RefreshHandler;
}) => (
  <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 md:p-8">
    <PlanHeader
      budget={planData.budget}
      needsSync={planData.needsSync}
      isRefreshing={isRefreshing}
      onRefresh={onRefresh}
    />
    <Card>
      <CardHeader>
        <CardTitle>No goals yet</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Create at least one active goal to see a monthly plan.
        </p>
        <Button render={<Link href="/goals" />} aria-label="Go to goals">
          Create goals
        </Button>
      </CardContent>
    </Card>
  </main>
);

const MainPlanView = ({
  planData,
  goalIds,
  unreachableGoalIds,
  isRefreshing,
  onRefresh,
}: {
  planData: ApiPlanResponse;
  goalIds: string[];
  unreachableGoalIds: Set<string>;
  isRefreshing: boolean;
  onRefresh: RefreshHandler;
}) => (
  <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 md:p-8">
    <header className="space-y-1">
      <h1 className="text-2xl font-semibold">Plan</h1>
      <p className="text-sm text-muted-foreground">
        Review calculated allocations, timeline, and conflict warnings.
      </p>
    </header>

    <PlanHeader
      budget={planData.budget}
      needsSync={planData.needsSync}
      isRefreshing={isRefreshing}
      onRefresh={onRefresh}
    />

    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
      <PlanTable allocations={planData.planResult.allocations} goalIds={goalIds} />
      <PlanTimeline
        goalIds={goalIds}
        completionMap={planData.planResult.completionMap}
        unreachableGoalIds={unreachableGoalIds}
      />
    </div>

    <PlanConflicts conflicts={planData.planResult.conflicts} tbdWarnings={planData.tbdWarnings} />
  </main>
);

export default function PlanPage() {
  const [state, setState] = useState<LoadState>("loading");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [planData, setPlanData] = useState<ApiPlanResponse | null>(null);

  const loadPlan = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) {
      setIsRefreshing(true);
    } else {
      setState("loading");
    }

    setStatusMessage(null);
    try {
      const response = await fetch("/api/plan/calculate", { method: "POST" });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as ApiErrorResponse | null;
        setState("error");
        setStatusMessage(data?.error ?? "Failed to load plan calculation.");
        return;
      }

      const payload = (await response.json()) as ApiPlanResponse;
      setPlanData(payload);
      setState("ready");
    } catch {
      setState("error");
      setStatusMessage("Unexpected network error while loading plan.");
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadPlan(false);
  }, [loadPlan]);

  const goalIds = useMemo(() => (planData ? extractGoalIds(planData) : []), [planData]);
  const unreachableGoalIds = useMemo(
    () =>
      new Set(
        (planData?.planResult.conflicts ?? [])
          .filter((entry): entry is Extract<ApiPlanConflict, { type: "unreachable" }> =>
            entry.type === "unreachable")
          .map((entry) => entry.goalId),
      ),
    [planData],
  );
  const handleRefresh = useCallback(async () => {
    await loadPlan(true);
  }, [loadPlan]);
  const handleRetry = useCallback(async () => {
    await loadPlan(false);
  }, [loadPlan]);

  if (state === "loading") {
    return <LoadingPlanState />;
  }

  if (state === "error" || !planData) {
    return <ErrorPlanState statusMessage={statusMessage} onRetry={handleRetry} />;
  }

  if (isLikelyMissingYnabConnection(planData)) {
    return <MissingConnectionPlanState />;
  }

  if (goalIds.length === 0) {
    return (
      <EmptyGoalsPlanState
        planData={planData}
        isRefreshing={isRefreshing}
        onRefresh={handleRefresh}
      />
    );
  }

  return (
    <MainPlanView
      planData={planData}
      goalIds={goalIds}
      unreachableGoalIds={unreachableGoalIds}
      isRefreshing={isRefreshing}
      onRefresh={handleRefresh}
    />
  );
}
