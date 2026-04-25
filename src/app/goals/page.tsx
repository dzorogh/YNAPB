"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { GoalForm, type GoalFormValues } from "@/components/goals/goal-form";
import { GoalsTable, type GoalRecord } from "@/components/goals/goals-table";

type ErrorResponse = {
  error?: string;
};

type GoalsResponse = {
  goals: GoalRecord[];
};

type GoalResponse = {
  goal: GoalRecord;
};

type StatusTone = "success" | "error";

type InlineStatus = {
  tone: StatusTone;
  title: string;
  message: string;
} | null;

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

const useGoalsQuery = (setStatus: (status: InlineStatus) => void) => {
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
        setStatus({ tone: "error", title: "Load failed", message });
        return;
      }

      const data = (await response.json()) as GoalsResponse;
      setGoals(data.goals);
    } catch {
      setStatus({
        tone: "error",
        title: "Load failed",
        message: "Unexpected network error while loading goals.",
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [setStatus]);

  useEffect(() => {
    void fetchGoals(false);
  }, [fetchGoals]);

  return { goals, setGoals, isLoading, isRefreshing, fetchGoals };
};

type GoalsStateSetter = Dispatch<SetStateAction<GoalRecord[]>>;

type GoalsMutationsParams = {
  setGoals: GoalsStateSetter;
  fetchGoals: (showRefreshing?: boolean) => Promise<void>;
  setStatus: (status: InlineStatus) => void;
};

const useCreateGoalMutation = ({
  setGoals,
  fetchGoals,
  setStatus,
}: GoalsMutationsParams) => {
  const [isCreating, setIsCreating] = useState(false);
  const handleCreateGoal = useCallback(async (values: GoalFormValues) => {
    setStatus(null);
    setIsCreating(true);
    try {
      const response = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(normalizeGoalPayload(values)),
      });

      if (!response.ok) {
        const message = await parseErrorMessage(response, "Failed to create goal.");
        setStatus({ tone: "error", title: "Create failed", message });
        return;
      }

      const data = (await response.json()) as GoalResponse;
      setGoals((currentGoals) => [data.goal, ...currentGoals]);
      setStatus({
        tone: "success",
        title: "Goal created",
        message: "Goal was added successfully.",
      });
      await fetchGoals(true);
    } catch {
      setStatus({
        tone: "error",
        title: "Create failed",
        message: "Unexpected network error while creating goal.",
      });
    } finally {
      setIsCreating(false);
    }
  }, [fetchGoals, setGoals, setStatus]);

  return { isCreating, handleCreateGoal };
};

type UpdateGoalMutationParams = GoalsMutationsParams & {
  editingGoal: GoalRecord | null;
  setEditingGoal: (goal: GoalRecord | null) => void;
};

const useUpdateGoalMutation = ({
  editingGoal,
  setEditingGoal,
  setGoals,
  fetchGoals,
  setStatus,
}: UpdateGoalMutationParams) => {
  const [isUpdating, setIsUpdating] = useState(false);

  const handleUpdateGoal = useCallback(async (values: GoalFormValues) => {
    if (!editingGoal) return;

    setStatus(null);
    setIsUpdating(true);
    try {
      const response = await fetch(`/api/goals/${editingGoal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(normalizeGoalPayload(values)),
      });

      if (!response.ok) {
        const message = await parseErrorMessage(response, "Failed to update goal.");
        setStatus({ tone: "error", title: "Update failed", message });
        return;
      }

      const data = (await response.json()) as GoalResponse;
      setGoals((currentGoals) =>
        currentGoals.map((goal) => (goal.id === data.goal.id ? data.goal : goal)),
      );
      setEditingGoal(null);
      setStatus({
        tone: "success",
        title: "Goal updated",
        message: "Goal changes were saved successfully.",
      });
      await fetchGoals(true);
    } catch {
      setStatus({
        tone: "error",
        title: "Update failed",
        message: "Unexpected network error while updating goal.",
      });
    } finally {
      setIsUpdating(false);
    }
  }, [editingGoal, fetchGoals, setGoals, setStatus]);

  return { isUpdating, handleUpdateGoal };
};

type DeleteGoalMutationParams = {
  editingGoalId: string | null;
  setEditingGoal: (goal: GoalRecord | null) => void;
  setGoals: GoalsStateSetter;
  setStatus: (status: InlineStatus) => void;
};

const useDeleteGoalMutation = ({
  editingGoalId,
  setEditingGoal,
  setGoals,
  setStatus,
}: DeleteGoalMutationParams) => {
  const [deletingGoalId, setDeletingGoalId] = useState<string | null>(null);

  const handleDeleteGoal = useCallback(async (goal: GoalRecord) => {
    const isConfirmed = window.confirm(`Delete goal "${goal.name}"?`);
    if (!isConfirmed) {
      return;
    }

    setStatus(null);
    setDeletingGoalId(goal.id);
    try {
      const response = await fetch(`/api/goals/${goal.id}`, { method: "DELETE" });
      if (!response.ok) {
        const message = await parseErrorMessage(response, "Failed to delete goal.");
        setStatus({ tone: "error", title: "Delete failed", message });
        return;
      }

      setGoals((currentGoals) => currentGoals.filter((item) => item.id !== goal.id));
      if (editingGoalId === goal.id) {
        setEditingGoal(null);
      }
      setStatus({
        tone: "success",
        title: "Goal deleted",
        message: "Goal was removed successfully.",
      });
    } catch {
      setStatus({
        tone: "error",
        title: "Delete failed",
        message: "Unexpected network error while deleting goal.",
      });
    } finally {
      setDeletingGoalId(null);
    }
  }, [editingGoalId, setEditingGoal, setGoals, setStatus]);

  return { deletingGoalId, handleDeleteGoal };
};

const GoalsHeader = () => (
  <header className="space-y-1">
    <h1 className="text-2xl font-semibold">Goals</h1>
    <p className="text-sm text-muted-foreground">Create, edit, and delete savings goals.</p>
  </header>
);

export default function GoalsPage() {
  const [status, setStatus] = useState<InlineStatus>(null);
  const [editingGoal, setEditingGoal] = useState<GoalRecord | null>(null);
  const { goals, setGoals, isLoading, isRefreshing, fetchGoals } = useGoalsQuery(setStatus);
  const editingGoalId = editingGoal?.id ?? null;
  const { isCreating, handleCreateGoal } = useCreateGoalMutation({
    setGoals,
    fetchGoals,
    setStatus,
  });
  const { isUpdating, handleUpdateGoal } = useUpdateGoalMutation({
    editingGoal,
    setEditingGoal,
    setGoals,
    fetchGoals,
    setStatus,
  });
  const { deletingGoalId, handleDeleteGoal } = useDeleteGoalMutation({
    editingGoalId,
    setEditingGoal,
    setGoals,
    setStatus,
  });

  useEffect(() => {
    if (!editingGoal) return;
    const actualGoal = goals.find((goal) => goal.id === editingGoal.id) ?? null;
    setEditingGoal(actualGoal);
  }, [editingGoal, goals]);

  const sortedGoals = useMemo(
    () => [...goals].sort((leftGoal, rightGoal) => leftGoal.deadline.localeCompare(rightGoal.deadline)),
    [goals],
  );

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 md:p-8">
      <GoalsHeader />

      {status ? (
        <Alert variant={status.tone === "error" ? "destructive" : "default"}>
          <AlertTitle>{status.title}</AlertTitle>
          <AlertDescription>{status.message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_1fr] lg:items-start">
        <GoalForm
          title="Create goal"
          submitLabel="Create goal"
          isSubmitting={isCreating}
          onSubmit={handleCreateGoal}
          disabled={isUpdating || deletingGoalId !== null}
        />

        <GoalsTable
          goals={sortedGoals}
          isLoading={isLoading}
          isRefreshing={isRefreshing}
          deletingGoalId={deletingGoalId}
          editingGoalId={editingGoalId}
          onEdit={setEditingGoal}
          onDelete={handleDeleteGoal}
        />
      </div>

      {editingGoal ? (
        <GoalForm
          title={`Edit goal: ${editingGoal.name}`}
          submitLabel="Save changes"
          isSubmitting={isUpdating}
          initialValues={mapGoalToFormValues(editingGoal)}
          onSubmit={handleUpdateGoal}
          onCancel={() => setEditingGoal(null)}
          disabled={isCreating || deletingGoalId !== null}
        />
      ) : null}
    </main>
  );
}
