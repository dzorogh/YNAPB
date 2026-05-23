"use client";
/* eslint-disable max-lines-per-function */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { GoalDialog } from "@/components/goals/goal-dialog";
import type { GoalFormValues } from "@/components/goals/goal-form";
import type { GoalRecord } from "@/components/goals/goal-record";
import { PlanConflicts } from "@/components/plan/plan-conflicts";
import { PlanHeader } from "@/components/plan/plan-header";
import { PlanTable } from "@/components/plan/plan-table";
import { PlanTimeline } from "@/components/plan/plan-timeline";
import {
  PushDiffDialog,
  type PushDiffRow,
} from "@/components/plan/push-diff-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { computePlan } from "@/lib/planner/planner";
import type { PlanResult as DomainPlanResult } from "@/lib/planner/types";
import { toUserFacingYnabError } from "@/lib/ynab/ynab-request";

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
  goals: Array<{
    id: string;
    name: string;
    targetAmount: number;
    currentBalance: number;
    savedProgress: number;
    availableBalance: number;
    deadline: string;
    status: "active" | "frozen" | "completed";
    ynabCategoryId: string | null;
    createdAt: string;
  }>;
  startMonth: string;
  horizonMonths: number;
  currencyCode: string;
  budget: {
    plannedIncome: number;
    obligations: number;
    available: number;
    obligationBreakdown: Array<{
      categoryId: string;
      categoryName: string;
      amount: number;
    }>;
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
  retryAfterSeconds?: number | null;
  requestCount?: number | null;
};

type YnabSyncErrorDetails = {
  message: string;
  retryAfterSeconds: number | null;
  requestCount: number | null;
};

type PushPreviewResponse = {
  diff: PushDiffRow[];
  diffHash: string;
};

type PushApplyResponse = {
  applied: number;
};

type LoadState = "loading" | "ready";
type LoadStatus = {
  tone: "success" | "error";
  title: string;
  message: string;
} | null;
type RefreshHandler = () => Promise<void>;
type DeadlineDraftMap = Record<string, string>;
type PushStatus = {
  tone: "success" | "error";
  title: string;
  message: string;
} | null;
type UnreachableByGoalId = Record<string, string | null>;

const currentMonthKey = (): string => {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
};

const parseYnabSyncError = async (
  response: Response,
  fallbackMessage: string,
): Promise<YnabSyncErrorDetails> => {
  try {
    const data = (await response.json()) as ApiErrorResponse;
    const retryAfterSeconds =
      typeof data.retryAfterSeconds === "number" &&
      Number.isFinite(data.retryAfterSeconds) &&
      data.retryAfterSeconds > 0
        ? Math.ceil(data.retryAfterSeconds)
        : null;
    const requestCount =
      typeof data.requestCount === "number" &&
      Number.isFinite(data.requestCount) &&
      data.requestCount > 0
        ? Math.ceil(data.requestCount)
        : null;
    if (typeof data.error === "string" && data.error.trim().length > 0) {
      const message =
        data.error.includes("YNAB calls in this import") ||
        requestCount === null
          ? data.error
          : toUserFacingYnabError(
              new Error(data.error),
              fallbackMessage,
              retryAfterSeconds,
              requestCount,
            );
      return {
        message,
        retryAfterSeconds,
        requestCount,
      };
    }
    return { message: fallbackMessage, retryAfterSeconds, requestCount };
  } catch {
    return {
      message: fallbackMessage,
      retryAfterSeconds: null,
      requestCount: null,
    };
  }
};

const parseErrorMessage = async (
  response: Response,
  fallbackMessage: string,
): Promise<string> => {
  const details = await parseYnabSyncError(response, fallbackMessage);
  return details.message;
};

const DEFAULT_IMPORT_COOLDOWN_SECONDS = 120;

const resolveImportCooldownMs = (
  retryAfterSeconds: number | null,
  status: number,
): number => {
  if (retryAfterSeconds !== null) {
    return retryAfterSeconds * 1000;
  }
  if (status === 429) {
    return DEFAULT_IMPORT_COOLDOWN_SECONDS * 1000;
  }
  return 60_000;
};

const toMonthStartIso = (value: string): string => `${value.slice(0, 7)}-01`;

const isLikelyMissingYnabConnection = (payload: ApiPlanResponse): boolean => {
  const hasAnyGoalSignals = payload.goals.length > 0;
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

const EmptyPlanState = ({ onRetry }: { onRetry: RefreshHandler }) => (
  <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 md:p-8">
    <Card>
      <CardHeader>
        <CardTitle>Plan</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground">
          Plan data is not available yet.
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => void onRetry()}
          aria-label="Retry loading plan"
        >
          Retry
        </Button>
        <Button render={<Link href="/settings" />} aria-label="Go to settings">
          Open settings
        </Button>
      </CardContent>
    </Card>
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
          Plan requires YNAB connection and synced data before calculation can
          start.
        </p>
        <Button render={<Link href="/settings" />} aria-label="Go to settings">
          Open settings
        </Button>
      </CardContent>
    </Card>
  </main>
);

type MainPlanViewProps = {
  planData: ApiPlanResponse;
  unreachableByGoalId: UnreachableByGoalId;
  completionByGoalId: Record<string, string | null>;
  allocations: ApiPlanResponse["planResult"]["allocations"];
  activeGoals: ApiPlanResponse["goals"];
  deadlineDrafts: DeadlineDraftMap;
  isRefreshing: boolean;
  isSyncingYnab: boolean;
  ynabImportBlockedUntil: number | null;
  onRefresh: RefreshHandler;
  onSyncYnab: RefreshHandler;
  onDragStartSnapshot: () => void;
  onDeadlinePreview: (goalId: string, nextDeadline: string) => void;
  onDeadlineCommit: (goalId: string, nextDeadline: string) => Promise<void>;
  onCancelPreview: () => void;
  onOpenCreateGoal: () => void;
  onOpenEditGoal: (goalId: string) => void;
  onOpenDeleteGoal: (goalId: string) => void;
  areGoalActionsDisabled: boolean;
  isPreviewLoading: boolean;
  onOpenPushPreview: () => Promise<void>;
  isPushDialogOpen: boolean;
  pushDiffRows: PushDiffRow[];
  isApplyingPush: boolean;
  onClosePushDialog: () => void;
  onApplyPushDiff: () => Promise<void>;
};

const MainPlanView = ({
  planData,
  unreachableByGoalId,
  completionByGoalId,
  allocations,
  activeGoals,
  deadlineDrafts,
  isRefreshing,
  isSyncingYnab,
  ynabImportBlockedUntil,
  onRefresh,
  onSyncYnab,
  onDragStartSnapshot,
  onDeadlinePreview,
  onDeadlineCommit,
  onCancelPreview,
  onOpenCreateGoal,
  onOpenEditGoal,
  onOpenDeleteGoal,
  areGoalActionsDisabled,
  isPreviewLoading,
  onOpenPushPreview,
  isPushDialogOpen,
  pushDiffRows,
  isApplyingPush,
  onClosePushDialog,
  onApplyPushDiff,
}: MainPlanViewProps) => (
  <main className="mx-auto flex w-full max-w-6xl flex-col gap-3 p-4 md:p-8">
    <header className="space-y-0.5">
      <h1 className="text-xl font-semibold md:text-2xl">Plan</h1>
      <p className="text-sm text-muted-foreground">
        Review calculated allocations, timeline, and conflict warnings.
      </p>
    </header>
    <PlanHeader
      budget={planData.budget}
      currencyCode={planData.currencyCode}
      needsSync={planData.needsSync}
      isRefreshing={isRefreshing}
      isSyncingYnab={isSyncingYnab}
      ynabImportBlockedUntil={ynabImportBlockedUntil}
      isPreviewLoading={isPreviewLoading}
      isApplyingPush={isApplyingPush}
      onRefresh={onRefresh}
      onSyncYnab={onSyncYnab}
      onOpenPushPreview={onOpenPushPreview}
    />
    <div className="space-y-4">
      <PlanTimeline
        goals={activeGoals}
        startMonthIso={planData.startMonth}
        horizonMonths={planData.horizonMonths}
        unreachableByGoalId={unreachableByGoalId}
        completionByGoalId={completionByGoalId}
        draftDeadlines={deadlineDrafts}
        isRecalculating={isRefreshing}
        currencyCode={planData.currencyCode}
        onOpenCreateGoal={onOpenCreateGoal}
        onOpenEditGoal={onOpenEditGoal}
        onOpenDeleteGoal={onOpenDeleteGoal}
        areGoalActionsDisabled={areGoalActionsDisabled}
        onDragStartSnapshot={onDragStartSnapshot}
        onDeadlinePreview={onDeadlinePreview}
        onDeadlineCommit={(goalId, nextDeadline) =>
          void onDeadlineCommit(goalId, nextDeadline)
        }
        onCancelPreview={onCancelPreview}
      />
      <PlanTable
        allocations={allocations}
        goals={activeGoals.map((goal) => ({
          id: goal.id,
          name: goal.name,
          deadline: goal.deadline,
        }))}
        currencyCode={planData.currencyCode}
      />
    </div>
    <PlanConflicts
      conflicts={planData.planResult.conflicts}
      tbdWarnings={planData.tbdWarnings}
    />
    <PushDiffDialog
      isOpen={isPushDialogOpen}
      diffRows={pushDiffRows}
      currencyCode={planData.currencyCode}
      onCancel={onClosePushDialog}
      onConfirm={onApplyPushDiff}
      isApplying={isApplyingPush}
    />
  </main>
);

const APPLY_FAILED_TITLE = "Apply failed";

const toPlannerResult = (
  result: DomainPlanResult,
): ApiPlanResponse["planResult"] => ({
  allocations: result.allocations.map((allocation) => ({
    month: allocation.month.toISOString(),
    perGoal: allocation.perGoal,
    unallocated: allocation.unallocated,
  })),
  conflicts: result.conflicts.map((conflict) =>
    conflict.type === "unreachable"
      ? {
          type: "unreachable",
          goalId: conflict.goalId,
          earliestAchievable:
            conflict.earliestAchievable?.toISOString() ?? null,
          detail: conflict.detail,
        }
      : {
          type: "tied_deadline",
          goalIds: conflict.goalIds,
          deadline: conflict.deadline.toISOString(),
          detail: conflict.detail,
        },
  ),
  completionMap: Object.fromEntries(
    Object.entries(result.completionMap).map(([goalId, value]) => [
      goalId,
      value?.toISOString() ?? null,
    ]),
  ),
  autoFrozenGoalIds: result.autoFrozenGoalIds,
});

const usePlanData = () => {
  const [state, setState] = useState<LoadState>("loading");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncingYnab, setIsSyncingYnab] = useState(false);
  const [ynabImportBlockedUntil, setYnabImportBlockedUntil] = useState<
    number | null
  >(null);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>(null);
  const [planData, setPlanData] = useState<ApiPlanResponse | null>(null);
  const [deadlineDrafts, setDeadlineDrafts] = useState<DeadlineDraftMap>({});
  const snapshotDeadlinesRef = useRef<DeadlineDraftMap | null>(null);
  const planDataRef = useRef(planData);
  planDataRef.current = planData;

  const loadPlan = useCallback(async (showRefreshing = false) => {
    const hasPlanData = planDataRef.current !== null;
    if (showRefreshing) {
      setIsRefreshing(true);
    } else if (!hasPlanData) {
      setState("loading");
    }

    try {
      const response = await fetch("/api/plan/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        const data = (await response
          .json()
          .catch(() => null)) as ApiErrorResponse | null;
        setLoadStatus({
          tone: "error",
          title: showRefreshing
            ? "Failed to refresh plan"
            : "Failed to load plan",
          message: toUserFacingYnabError(
            data?.error ? new Error(data.error) : null,
            "Failed to load plan calculation.",
          ),
        });
        if (!hasPlanData) {
          setState("ready");
        }
        return;
      }

      const payload = (await response.json()) as ApiPlanResponse;
      setPlanData(payload);
      setState("ready");
    } catch {
      setLoadStatus({
        tone: "error",
        title: showRefreshing
          ? "Failed to refresh plan"
          : "Failed to load plan",
        message: "Unexpected network error while loading plan.",
      });
      if (!hasPlanData) {
        setState("ready");
      }
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadPlan(false);
  }, [loadPlan]);

  const activeGoals = useMemo(
    () => (planData?.goals ?? []).filter((goal) => goal.status === "active"),
    [planData],
  );
  const plannerInputGoals = useMemo(
    () =>
      activeGoals.map((goal) => ({
        id: goal.id,
        name: goal.name,
        targetAmount: goal.targetAmount,
        currentBalance: goal.currentBalance,
        savedProgress: goal.savedProgress,
        availableBalance: goal.availableBalance,
        deadline: new Date(
          `${(deadlineDrafts[goal.id] ?? goal.deadline).slice(0, 7)}-01T00:00:00.000Z`,
        ),
        status: goal.status,
        ynabCategoryId: goal.ynabCategoryId,
        createdAt: new Date(goal.createdAt),
      })),
    [activeGoals, deadlineDrafts],
  );
  const previewPlanResult = useMemo(() => {
    if (!planData) {
      return null;
    }
    return toPlannerResult(
      computePlan({
        goals: plannerInputGoals,
        budget: planData.budget,
        startMonth: new Date(planData.startMonth),
        horizonMonths: planData.horizonMonths,
      }),
    );
  }, [planData, plannerInputGoals]);
  const unreachableByGoalId = useMemo(() => {
    const conflicts = previewPlanResult?.conflicts ?? [];
    return conflicts
      .filter(
        (entry): entry is Extract<ApiPlanConflict, { type: "unreachable" }> =>
          entry.type === "unreachable",
      )
      .reduce<UnreachableByGoalId>((acc, entry) => {
        acc[entry.goalId] = entry.earliestAchievable;
        return acc;
      }, {});
  }, [previewPlanResult]);
  const handleRefresh = useCallback(async () => {
    await loadPlan(true);
  }, [loadPlan]);
  const handleSyncYnab = useCallback(async () => {
    if (
      ynabImportBlockedUntil !== null &&
      Date.now() < ynabImportBlockedUntil
    ) {
      const secondsLeft = Math.ceil(
        (ynabImportBlockedUntil - Date.now()) / 1000,
      );
      setLoadStatus({
        tone: "error",
        title: "YNAB import unavailable",
        message: `Wait about ${secondsLeft} seconds before importing again.`,
      });
      return;
    }

    setIsSyncingYnab(true);
    try {
      const syncResponse = await fetch("/api/ynab/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!syncResponse.ok) {
        const { message, retryAfterSeconds } = await parseYnabSyncError(
          syncResponse,
          "Failed to import data from YNAB.",
        );
        setYnabImportBlockedUntil(
          Date.now() +
            resolveImportCooldownMs(retryAfterSeconds, syncResponse.status),
        );
        setLoadStatus({
          tone: "error",
          title: "YNAB import failed",
          message,
        });
        return;
      }

      setYnabImportBlockedUntil(null);
      await loadPlan(true);
      setLoadStatus({
        tone: "success",
        title: "YNAB data imported",
        message: "Categories and income were refreshed. Plan was recalculated.",
      });
    } catch {
      setLoadStatus({
        tone: "error",
        title: "YNAB import failed",
        message: "Unexpected network error while importing from YNAB.",
      });
    } finally {
      setIsSyncingYnab(false);
    }
  }, [loadPlan, ynabImportBlockedUntil]);
  const handleRetry = useCallback(async () => {
    await loadPlan(false);
  }, [loadPlan]);
  const handleDragStartSnapshot = useCallback(() => {
    snapshotDeadlinesRef.current = { ...deadlineDrafts };
  }, [deadlineDrafts]);
  const handleDeadlinePreview = useCallback(
    (goalId: string, nextDeadline: string) => {
      setDeadlineDrafts((current) => ({
        ...current,
        [goalId]: toMonthStartIso(nextDeadline),
      }));
    },
    [],
  );
  const handleCancelPreview = useCallback(() => {
    const snapshot = snapshotDeadlinesRef.current;
    if (!snapshot) {
      return;
    }
    setDeadlineDrafts(snapshot);
    snapshotDeadlinesRef.current = null;
  }, []);
  const handleCommitDeadline = useCallback(
    async (goalId: string, nextDeadline: string) => {
      const deadlineIso = toMonthStartIso(nextDeadline);
      try {
        const response = await fetch("/api/plan/deadlines", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deadlines: [{ goalId, deadline: deadlineIso }],
          }),
        });
        if (!response.ok) {
          const message = await parseErrorMessage(
            response,
            "Failed to save deadline.",
          );
          toast.error("Could not save deadline", {
            description: message,
          });
          return;
        }

        snapshotDeadlinesRef.current = null;
        // Keep draft in sync with what we persisted; otherwise stale drag
        // previews override server deadlines and conflicts never clear.
        setDeadlineDrafts((current) => ({
          ...current,
          [goalId]: deadlineIso,
        }));
        await loadPlan(true);
      } catch {
        toast.error("Could not save deadline", {
          description: "Unexpected network error.",
        });
      }
    },
    [loadPlan],
  );

  return {
    state,
    isRefreshing,
    isSyncingYnab,
    ynabImportBlockedUntil,
    loadStatus,
    clearLoadStatus: () => setLoadStatus(null),
    planData,
    activeGoals,
    unreachableByGoalId,
    deadlineDrafts,
    previewPlanResult,
    loadPlan,
    handleRefresh,
    handleSyncYnab,
    handleRetry,
    handleDragStartSnapshot,
    handleDeadlinePreview,
    handleCommitDeadline,
    handleCancelPreview,
  };
};

const usePushPreview = ({
  monthKey,
  setPushStatus,
  setPushDiffRows,
  setPreviewDiffHash,
  setIsPushDialogOpen,
}: {
  monthKey: string;
  setPushStatus: (status: PushStatus) => void;
  setPushDiffRows: (rows: PushDiffRow[]) => void;
  setPreviewDiffHash: (value: string | null) => void;
  setIsPushDialogOpen: (value: boolean) => void;
}) => {
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  const handleOpenPushPreview = useCallback(async () => {
    setPushStatus(null);
    setIsPreviewLoading(true);
    try {
      const response = await fetch("/api/plan/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "preview", month: monthKey }),
      });
      if (!response.ok) {
        const message = await parseErrorMessage(
          response,
          "Failed to prepare YNAB push preview.",
        );
        setPushStatus({ tone: "error", title: "Preview failed", message });
        return;
      }
      const payload = (await response.json()) as PushPreviewResponse;
      setPushDiffRows(payload.diff);
      setPreviewDiffHash(payload.diffHash);
      setIsPushDialogOpen(true);
    } catch {
      setPushStatus({
        tone: "error",
        title: "Preview failed",
        message: "Unexpected network error while preparing push preview.",
      });
    } finally {
      setIsPreviewLoading(false);
    }
  }, [
    monthKey,
    setIsPushDialogOpen,
    setPreviewDiffHash,
    setPushDiffRows,
    setPushStatus,
  ]);

  return { isPreviewLoading, handleOpenPushPreview };
};

const usePushApply = ({
  loadPlan,
  monthKey,
  previewDiffHash,
  setPushStatus,
  setPreviewDiffHash,
  setIsPushDialogOpen,
}: {
  loadPlan: (showRefreshing?: boolean) => Promise<void>;
  monthKey: string;
  previewDiffHash: string | null;
  setPushStatus: (status: PushStatus) => void;
  setPreviewDiffHash: (value: string | null) => void;
  setIsPushDialogOpen: (value: boolean) => void;
}) => {
  const [isApplyingPush, setIsApplyingPush] = useState(false);

  const handleApplyPushDiff = useCallback(async () => {
    if (!previewDiffHash) {
      setPushStatus({
        tone: "error",
        title: APPLY_FAILED_TITLE,
        message: "Preview hash is missing. Run preview again.",
      });
      setIsPushDialogOpen(false);
      return;
    }

    setPushStatus(null);
    setIsApplyingPush(true);
    try {
      const response = await fetch("/api/plan/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "apply",
          month: monthKey,
          acceptedDiffHash: previewDiffHash,
        }),
      });
      if (!response.ok) {
        const message = await parseErrorMessage(
          response,
          "Failed to apply YNAB push.",
        );
        setPushStatus({ tone: "error", title: APPLY_FAILED_TITLE, message });
        return;
      }
      const payload = (await response.json()) as PushApplyResponse;
      setPushStatus({
        tone: "success",
        title: "Push completed",
        message:
          payload.applied > 0
            ? `Applied ${payload.applied} YNAB goal update(s) and refreshed plan data.`
            : "No YNAB updates were needed. Plan data was refreshed.",
      });
      setIsPushDialogOpen(false);
      setPreviewDiffHash(null);
      await loadPlan(true);
    } catch {
      setPushStatus({
        tone: "error",
        title: APPLY_FAILED_TITLE,
        message: "Unexpected network error while applying push updates.",
      });
    } finally {
      setIsApplyingPush(false);
    }
  }, [
    loadPlan,
    monthKey,
    previewDiffHash,
    setIsPushDialogOpen,
    setPreviewDiffHash,
    setPushStatus,
  ]);

  return { isApplyingPush, handleApplyPushDiff };
};

export default function PlanPage() {
  const monthKey = useMemo(() => currentMonthKey(), []);
  const {
    state,
    isRefreshing,
    isSyncingYnab,
    ynabImportBlockedUntil,
    loadStatus,
    clearLoadStatus,
    planData,
    activeGoals,
    unreachableByGoalId,
    deadlineDrafts,
    previewPlanResult,
    loadPlan,
    handleRefresh,
    handleSyncYnab,
    handleRetry,
    handleDragStartSnapshot,
    handleDeadlinePreview,
    handleCommitDeadline,
    handleCancelPreview,
  } = usePlanData();
  const goalsCrud = useGoalsCrud({
    onAfterMutation: async () => {
      await loadPlan(true);
    },
  });
  const [pushStatus, setPushStatus] = useState<PushStatus>(null);
  const [isPushDialogOpen, setIsPushDialogOpen] = useState(false);
  const [pushDiffRows, setPushDiffRows] = useState<PushDiffRow[]>([]);
  const [previewDiffHash, setPreviewDiffHash] = useState<string | null>(null);
  const goalsCrudStatus = goalsCrud.status;
  const clearGoalsCrudStatus = goalsCrud.clearStatus;
  const { isPreviewLoading, handleOpenPushPreview } = usePushPreview({
    monthKey,
    setPushStatus,
    setPushDiffRows,
    setPreviewDiffHash,
    setIsPushDialogOpen,
  });
  const { isApplyingPush, handleApplyPushDiff } = usePushApply({
    loadPlan,
    monthKey,
    previewDiffHash,
    setPushStatus,
    setPreviewDiffHash,
    setIsPushDialogOpen,
  });
  const handleClosePushDialog = useCallback(() => {
    if (isApplyingPush) {
      return;
    }
    setIsPushDialogOpen(false);
  }, [isApplyingPush]);

  useEffect(() => {
    if (!pushStatus) {
      return;
    }
    if (pushStatus.tone === "error") {
      toast.error(pushStatus.title, { description: pushStatus.message });
    } else {
      toast.success(pushStatus.title, { description: pushStatus.message });
    }
    setPushStatus(null);
  }, [pushStatus]);

  useEffect(() => {
    if (!loadStatus) {
      return;
    }
    if (loadStatus.tone === "error") {
      toast.error(loadStatus.title, { description: loadStatus.message });
    } else {
      toast.success(loadStatus.title, { description: loadStatus.message });
    }
    clearLoadStatus();
  }, [clearLoadStatus, loadStatus]);

  useEffect(() => {
    if (!goalsCrudStatus) {
      return;
    }
    if (goalsCrudStatus.tone === "error") {
      toast.error(goalsCrudStatus.title, {
        description: goalsCrudStatus.message,
      });
    } else {
      toast.success(goalsCrudStatus.title, {
        description: goalsCrudStatus.message,
      });
    }
    clearGoalsCrudStatus();
  }, [clearGoalsCrudStatus, goalsCrudStatus]);

  if (state === "loading" && !planData) {
    return <LoadingPlanState />;
  }

  if (!planData || !previewPlanResult) {
    return <EmptyPlanState onRetry={handleRetry} />;
  }

  if (isLikelyMissingYnabConnection(planData)) {
    return <MissingConnectionPlanState />;
  }

  const allocations = previewPlanResult.allocations;
  return (
    <>
      <MainPlanView
        planData={{ ...planData, planResult: previewPlanResult }}
        activeGoals={activeGoals}
        unreachableByGoalId={unreachableByGoalId}
        completionByGoalId={previewPlanResult.completionMap}
        allocations={allocations}
        deadlineDrafts={deadlineDrafts}
        isRefreshing={isRefreshing}
        isSyncingYnab={isSyncingYnab}
        ynabImportBlockedUntil={ynabImportBlockedUntil}
        onSyncYnab={handleSyncYnab}
        onOpenCreateGoal={goalsCrud.openCreateGoalModal}
        onOpenEditGoal={goalsCrud.openEditGoalById}
        onOpenDeleteGoal={goalsCrud.openDeleteGoalById}
        areGoalActionsDisabled={goalsCrud.areGoalActionsDisabled}
        onRefresh={handleRefresh}
        onDragStartSnapshot={handleDragStartSnapshot}
        onDeadlinePreview={handleDeadlinePreview}
        onDeadlineCommit={handleCommitDeadline}
        onCancelPreview={handleCancelPreview}
        isPreviewLoading={isPreviewLoading}
        onOpenPushPreview={handleOpenPushPreview}
        isPushDialogOpen={isPushDialogOpen}
        pushDiffRows={pushDiffRows}
        isApplyingPush={isApplyingPush}
        onClosePushDialog={handleClosePushDialog}
        onApplyPushDiff={handleApplyPushDiff}
      />
      {goalsCrud.createDialog}
      {goalsCrud.editDialog}
      {goalsCrud.deleteDialog}
    </>
  );
}

type ErrorResponse = { error?: string };

type GoalsResponse = { goals: GoalRecord[] };
type GoalResponse = { goal: GoalRecord };

const normalizeGoalPayload = (values: GoalFormValues) => ({
  name: values.name.trim(),
  targetAmount: Number(values.targetAmount),
  deadline: values.deadline,
  status: values.status,
  notes: values.notes.trim() ? values.notes.trim() : null,
  ynabCategoryId: values.ynabCategoryId.trim()
    ? values.ynabCategoryId.trim()
    : null,
});

const parseGoalsError = async (
  response: Response,
  fallbackMessage: string,
): Promise<string> => {
  try {
    const data = (await response.json()) as ErrorResponse;
    if (typeof data.error === "string" && data.error.length > 0) {
      return data.error;
    }
    return fallbackMessage;
  } catch {
    return fallbackMessage;
  }
};

const mapGoalToFormValues = (goal: GoalRecord): GoalFormValues => ({
  name: goal.name,
  targetAmount: String(goal.target_amount),
  deadline: goal.deadline,
  status: goal.status,
  notes: goal.notes ?? "",
  ynabCategoryId: goal.ynab_category_id ?? "",
});

const DeleteGoalDialog = ({
  goal,
  isDeleting,
  onCancel,
  onConfirm,
}: {
  goal: GoalRecord | null;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) => {
  if (!goal) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Delete goal confirmation"
      tabIndex={-1}
      onClick={onCancel}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onCancel();
        }
      }}
    >
      <Card
        className="w-full max-w-md"
        onClick={(event) => event.stopPropagation()}
      >
        <CardHeader>
          <CardTitle>Delete goal</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Delete goal{" "}
            <span className="font-medium text-foreground">{goal.name}</span>?
            This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void onConfirm()}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const useGoalsCrud = ({
  onAfterMutation,
}: {
  onAfterMutation: () => Promise<void>;
}) => {
  const [status, setStatus] = useState<PushStatus>(null);
  const [goals, setGoals] = useState<GoalRecord[]>([]);
  const [isLoadingGoals, setIsLoadingGoals] = useState(true);
  const [isRefreshingGoals, setIsRefreshingGoals] = useState(false);
  const [isCreateGoalModalOpen, setIsCreateGoalModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<GoalRecord | null>(null);
  const [deletingGoal, setDeletingGoal] = useState<GoalRecord | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [deletingGoalId, setDeletingGoalId] = useState<string | null>(null);

  const fetchGoals = useCallback(async (refresh = false) => {
    if (refresh) {
      setIsRefreshingGoals(true);
    } else {
      setIsLoadingGoals(true);
    }
    try {
      const response = await fetch("/api/goals");
      if (!response.ok) {
        setStatus({
          tone: "error",
          title: "Load failed",
          message: await parseGoalsError(response, "Failed to load goals."),
        });
        return;
      }
      const data = (await response.json()) as GoalsResponse;
      setGoals(data.goals);
    } finally {
      setIsLoadingGoals(false);
      setIsRefreshingGoals(false);
    }
  }, []);

  useEffect(() => {
    void fetchGoals(false);
  }, [fetchGoals]);

  const handleCreateGoal = useCallback(
    async (values: GoalFormValues) => {
      setIsCreating(true);
      setStatus(null);
      try {
        const response = await fetch("/api/goals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(normalizeGoalPayload(values)),
        });
        if (!response.ok) {
          setStatus({
            tone: "error",
            title: "Create failed",
            message: await parseGoalsError(response, "Failed to create goal."),
          });
          return;
        }
        const data = (await response.json()) as GoalResponse;
        setGoals((current) => [data.goal, ...current]);
        setStatus({
          tone: "success",
          title: "Goal created",
          message: "Goal added successfully.",
        });
        setIsCreateGoalModalOpen(false);
        await fetchGoals(true);
        await onAfterMutation();
      } finally {
        setIsCreating(false);
      }
    },
    [fetchGoals, onAfterMutation],
  );

  const handleUpdateGoal = useCallback(
    async (values: GoalFormValues) => {
      if (!editingGoal) {
        return;
      }
      setIsUpdating(true);
      setStatus(null);
      try {
        const response = await fetch(`/api/goals/${editingGoal.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(normalizeGoalPayload(values)),
        });
        if (!response.ok) {
          setStatus({
            tone: "error",
            title: "Update failed",
            message: await parseGoalsError(response, "Failed to update goal."),
          });
          return;
        }
        const data = (await response.json()) as GoalResponse;
        setGoals((current) =>
          current.map((goal) => (goal.id === data.goal.id ? data.goal : goal)),
        );
        setEditingGoal(null);
        setStatus({
          tone: "success",
          title: "Goal updated",
          message: "Goal updated successfully.",
        });
        await fetchGoals(true);
        await onAfterMutation();
      } finally {
        setIsUpdating(false);
      }
    },
    [editingGoal, fetchGoals, onAfterMutation],
  );

  const handleDeleteGoal = useCallback(async () => {
    if (!deletingGoal) {
      return;
    }
    setDeletingGoalId(deletingGoal.id);
    setStatus(null);
    try {
      const response = await fetch(`/api/goals/${deletingGoal.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        setStatus({
          tone: "error",
          title: "Delete failed",
          message: await parseGoalsError(response, "Failed to delete goal."),
        });
        return;
      }
      setGoals((current) =>
        current.filter((item) => item.id !== deletingGoal.id),
      );
      if (editingGoal?.id === deletingGoal.id) {
        setEditingGoal(null);
      }
      setDeletingGoal(null);
      setStatus({
        tone: "success",
        title: "Goal deleted",
        message: "Goal removed successfully.",
      });
      await onAfterMutation();
    } finally {
      setDeletingGoalId(null);
    }
  }, [deletingGoal, editingGoal?.id, onAfterMutation]);

  const goalsById = useMemo(
    () => new Map(goals.map((goal) => [goal.id, goal])),
    [goals],
  );

  const clearStatus = useCallback(() => {
    setStatus(null);
  }, []);

  return {
    status,
    clearStatus,
    isLoadingGoals,
    isRefreshingGoals,
    areGoalActionsDisabled:
      isLoadingGoals ||
      isRefreshingGoals ||
      isCreating ||
      isUpdating ||
      deletingGoalId !== null,
    openCreateGoalModal: () => setIsCreateGoalModalOpen(true),
    openEditGoalById: (goalId: string) => {
      const goal = goalsById.get(goalId);
      if (goal) {
        setEditingGoal(goal);
      }
    },
    openDeleteGoalById: (goalId: string) => {
      const goal = goalsById.get(goalId);
      if (goal) {
        setDeletingGoal(goal);
      }
    },
    createDialog: (
      <GoalDialog
        mode="create"
        isOpen={isCreateGoalModalOpen}
        isSubmitting={isCreating}
        disabled={isUpdating || deletingGoalId !== null}
        onClose={() => setIsCreateGoalModalOpen(false)}
        onSubmit={handleCreateGoal}
      />
    ),
    editDialog: (
      <GoalDialog
        mode="edit"
        isOpen={Boolean(editingGoal)}
        isSubmitting={isUpdating}
        initialValues={
          editingGoal ? mapGoalToFormValues(editingGoal) : undefined
        }
        disabled={isCreating || deletingGoalId !== null}
        onClose={() => setEditingGoal(null)}
        onSubmit={handleUpdateGoal}
      />
    ),
    deleteDialog: (
      <DeleteGoalDialog
        goal={deletingGoal}
        isDeleting={deletingGoalId !== null}
        onCancel={() => setDeletingGoal(null)}
        onConfirm={handleDeleteGoal}
      />
    ),
  };
};
