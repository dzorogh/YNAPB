"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { toast } from "sonner";
import { GoalDialog } from "@/components/goals/goal-dialog";
import { type GoalFormValues } from "@/components/goals/goal-form";
import { GoalsTable, type GoalRecord } from "@/components/goals/goals-table";
import { Button } from "@/components/ui/button";

type ErrorResponse = {
  error?: string;
};

type GoalsResponse = {
  goals: GoalRecord[];
};

type GoalResponse = {
  goal: GoalRecord;
  sync?: {
    status: "synced" | "error" | "skipped";
    message?: string;
  };
};

const parseErrorMessage = async (response: Response, fallbackMessage: string): Promise<string> => {
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

const normalizeGoalPayload = (values: GoalFormValues) => ({
  name: values.name.trim(),
  targetAmount: Number(values.targetAmount),
  deadline: values.deadline,
  status: values.status,
  notes: values.notes.trim() ? values.notes.trim() : null,
  ynabCategoryId: values.ynabCategoryId.trim() ? values.ynabCategoryId.trim() : null,
});

const useGoalsQuery = () => {
  const [goals, setGoals] = useState<GoalRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchGoals = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const response = await fetch("/api/goals", { method: "GET" });
      if (!response.ok) {
        const message = await parseErrorMessage(response, "Failed to load goals.");
        toast.error(message);
        return;
      }

      const data = (await response.json()) as GoalsResponse;
      setGoals(data.goals);
    } catch {
      toast.error("Unexpected network error while loading goals.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchGoals(false);
  }, [fetchGoals]);

  return { goals, setGoals, isLoading, isRefreshing, fetchGoals };
};

type GoalsStateSetter = Dispatch<SetStateAction<GoalRecord[]>>;

type GoalsMutationsParams = {
  setGoals: GoalsStateSetter;
  fetchGoals: (showRefreshing?: boolean) => Promise<void>;
  closeModal: () => void;
};

const useCreateGoalMutation = ({
  setGoals,
  fetchGoals,
  closeModal,
}: GoalsMutationsParams) => {
  const [isCreating, setIsCreating] = useState(false);
  const handleCreateGoal = useCallback(async (values: GoalFormValues) => {
    setIsCreating(true);
    try {
      const response = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(normalizeGoalPayload(values)),
      });

      if (!response.ok) {
        const message = await parseErrorMessage(response, "Failed to create goal.");
        toast.error(message);
        return;
      }

      const data = (await response.json()) as GoalResponse;
      setGoals((currentGoals) => [data.goal, ...currentGoals]);
      closeModal();
      notifyGoalSyncResult("create", data.sync);
      await fetchGoals(true);
    } catch {
      toast.error("Unexpected network error while creating goal.");
    } finally {
      setIsCreating(false);
    }
  }, [closeModal, fetchGoals, setGoals]);

  return { isCreating, handleCreateGoal };
};

type UpdateGoalMutationParams = GoalsMutationsParams & {
  editingGoalId: string | null;
};

const useUpdateGoalMutation = ({
  editingGoalId,
  setGoals,
  fetchGoals,
  closeModal,
}: UpdateGoalMutationParams) => {
  const [isUpdating, setIsUpdating] = useState(false);

  const handleUpdateGoal = useCallback(async (values: GoalFormValues) => {
    if (!editingGoalId) return;

    setIsUpdating(true);
    try {
      const response = await fetch(`/api/goals/${editingGoalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(normalizeGoalPayload(values)),
      });

      if (!response.ok) {
        const message = await parseErrorMessage(response, "Failed to update goal.");
        toast.error(message);
        return;
      }

      const data = (await response.json()) as GoalResponse;
      setGoals((currentGoals) =>
        currentGoals.map((goal) => (goal.id === data.goal.id ? data.goal : goal)),
      );
      closeModal();
      notifyGoalSyncResult("update", data.sync);
      await fetchGoals(true);
    } catch {
      toast.error("Unexpected network error while updating goal.");
    } finally {
      setIsUpdating(false);
    }
  }, [closeModal, editingGoalId, fetchGoals, setGoals]);

  return { isUpdating, handleUpdateGoal };
};

type DeleteGoalMutationParams = {
  editingGoalId: string | null;
  closeModal: () => void;
  setGoals: GoalsStateSetter;
};

const useDeleteGoalMutation = ({
  editingGoalId,
  closeModal,
  setGoals,
}: DeleteGoalMutationParams) => {
  const [deletingGoalId, setDeletingGoalId] = useState<string | null>(null);

  const handleDeleteGoal = useCallback(async (goal: GoalRecord) => {
    const isConfirmed = window.confirm(`Delete goal "${goal.name}"?`);
    if (!isConfirmed) {
      return;
    }

    setDeletingGoalId(goal.id);
    try {
      const response = await fetch(`/api/goals/${goal.id}`, { method: "DELETE" });
      if (!response.ok) {
        const message = await parseErrorMessage(response, "Failed to delete goal.");
        toast.error(message);
        return;
      }

      setGoals((currentGoals) => currentGoals.filter((item) => item.id !== goal.id));
      if (editingGoalId === goal.id) {
        closeModal();
      }
      toast.success("Goal deleted");
    } catch {
      toast.error("Unexpected network error while deleting goal.");
    } finally {
      setDeletingGoalId(null);
    }
  }, [closeModal, editingGoalId, setGoals]);

  return { deletingGoalId, handleDeleteGoal };
};

const notifyGoalSyncResult = (
  action: "create" | "update",
  sync?: GoalResponse["sync"],
) => {
  if (sync?.status === "error") {
    toast.error(sync.message ?? "Goal saved, but YNAB sync failed.");
    return;
  }

  if (sync?.status === "synced") {
    toast.success(action === "create" ? "Goal saved and synced to YNAB" : "Goal updated and synced to YNAB");
    return;
  }

  toast.success(action === "create" ? "Goal created" : "Goal updated");
};

type GoalsDialogState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; goalId: string };

export default function GoalsPage() {
  const [dialogState, setDialogState] = useState<GoalsDialogState>({ mode: "closed" });
  const { goals, setGoals, isLoading, isRefreshing, fetchGoals } = useGoalsQuery();
  const editingGoalId = dialogState.mode === "edit" ? dialogState.goalId : null;
  const editingGoal = editingGoalId
    ? (goals.find((goal) => goal.id === editingGoalId) ?? null)
    : null;
  const closeDialog = useCallback(() => setDialogState({ mode: "closed" }), []);
  const { isCreating, handleCreateGoal } = useCreateGoalMutation({
    setGoals,
    fetchGoals,
    closeModal: closeDialog,
  });
  const { isUpdating, handleUpdateGoal } = useUpdateGoalMutation({
    editingGoalId,
    setGoals,
    fetchGoals,
    closeModal: closeDialog,
  });
  const { deletingGoalId, handleDeleteGoal } = useDeleteGoalMutation({
    editingGoalId,
    closeModal: closeDialog,
    setGoals,
  });

  useEffect(() => {
    if (dialogState.mode !== "edit") {
      return;
    }

    const actualGoalExists = goals.some((goal) => goal.id === dialogState.goalId);
    if (!actualGoalExists) {
      closeDialog();
    }
  }, [closeDialog, dialogState, goals]);

  const sortedGoals = useMemo(
    () => [...goals].sort((leftGoal, rightGoal) => leftGoal.deadline.localeCompare(rightGoal.deadline)),
    [goals],
  );

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 md:p-8">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Goals</h1>
          <p className="text-sm text-muted-foreground">Create, edit, and delete savings goals.</p>
        </div>
        <Button type="button" onClick={() => setDialogState({ mode: "create" })}>
          Create goal
        </Button>
      </div>

      <GoalsTable
        goals={sortedGoals}
        isLoading={isLoading}
        isRefreshing={isRefreshing}
        deletingGoalId={deletingGoalId}
        editingGoalId={editingGoalId}
        onEdit={(goal) => setDialogState({ mode: "edit", goalId: goal.id })}
        onDelete={handleDeleteGoal}
      />

      <GoalDialog
        mode={dialogState.mode === "edit" ? "edit" : "create"}
        isOpen={dialogState.mode !== "closed"}
        isSubmitting={dialogState.mode === "edit" ? isUpdating : isCreating}
        initialValues={dialogState.mode === "edit" && editingGoal ? mapGoalToFormValues(editingGoal) : undefined}
        onSubmit={dialogState.mode === "edit" ? handleUpdateGoal : handleCreateGoal}
        onClose={closeDialog}
        disabled={deletingGoalId !== null}
      />
    </main>
  );
}
