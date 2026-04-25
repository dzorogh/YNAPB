"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { GoalStatus } from "@/components/goals/goal-form";

export type GoalRecord = {
  id: string;
  name: string;
  target_amount: number;
  deadline: string;
  status: GoalStatus;
  notes: string | null;
  ynab_category_id: string | null;
  last_sync_status: string;
  last_sync_error: string | null;
  last_synced_at: string | null;
};

type GoalsTableProps = {
  goals: GoalRecord[];
  isLoading: boolean;
  isRefreshing: boolean;
  deletingGoalId: string | null;
  editingGoalId: string | null;
  onEdit: (goal: GoalRecord) => void;
  onDelete: (goal: GoalRecord) => Promise<void>;
};

const statusLabels: Record<GoalStatus, string> = {
  active: "Active",
  frozen: "Frozen",
  completed: "Completed",
};

export const GoalsTable = ({
  goals,
  isLoading,
  isRefreshing,
  deletingGoalId,
  editingGoalId,
  onEdit,
  onDelete,
}: GoalsTableProps) => (
  <Card>
    <CardHeader className="space-y-1">
      <CardTitle>Goals</CardTitle>
      <p className="text-sm text-muted-foreground">
        {isRefreshing ? "Refreshing goals..." : "Manage your saving goals and statuses."}
      </p>
    </CardHeader>
    <CardContent>
      <GoalsTableContent
        goals={goals}
        isLoading={isLoading}
        deletingGoalId={deletingGoalId}
        editingGoalId={editingGoalId}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </CardContent>
  </Card>
);

type GoalsTableContentProps = Omit<GoalsTableProps, "isRefreshing">;

const GoalsTableContent = ({
  goals,
  isLoading,
  deletingGoalId,
  editingGoalId,
  onEdit,
  onDelete,
}: GoalsTableContentProps) => {
  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading goals...</p>;
  }

  if (goals.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-4">
        <p className="font-medium">No goals yet</p>
        <p className="text-sm text-muted-foreground">
          Create your first goal to start tracking progress.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="p-2 font-medium">Name</th>
            <th className="p-2 font-medium">Target</th>
            <th className="p-2 font-medium">Deadline</th>
            <th className="p-2 font-medium">Status</th>
            <th className="p-2 font-medium">YNAB category</th>
            <th className="p-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {goals.map((goal) => (
            <GoalRow
              key={goal.id}
              goal={goal}
              deletingGoalId={deletingGoalId}
              editingGoalId={editingGoalId}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
};

type GoalRowProps = {
  goal: GoalRecord;
  deletingGoalId: string | null;
  editingGoalId: string | null;
  onEdit: (goal: GoalRecord) => void;
  onDelete: (goal: GoalRecord) => Promise<void>;
};

const GoalRow = ({ goal, deletingGoalId, editingGoalId, onEdit, onDelete }: GoalRowProps) => (
  <tr className="border-b align-top">
    <td className="p-2">
      <p className="font-medium">{goal.name}</p>
      {goal.notes ? <p className="text-xs text-muted-foreground">{goal.notes}</p> : null}
      {goal.last_sync_status === "error" ? (
        <p className="mt-1 inline-flex rounded bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
          Unsynced
        </p>
      ) : null}
    </td>
    <td className="p-2">{goal.target_amount.toFixed(2)}</td>
    <td className="p-2">{goal.deadline}</td>
    <td className="p-2">{statusLabels[goal.status]}</td>
    <td className="p-2">{goal.ynab_category_id ?? "—"}</td>
    <td className="p-2">
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onEdit(goal)}
          disabled={deletingGoalId === goal.id}
        >
          {editingGoalId === goal.id ? "Editing..." : "Edit"}
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={() => void onDelete(goal)}
          disabled={deletingGoalId === goal.id}
        >
          {deletingGoalId === goal.id ? "Deleting..." : "Delete"}
        </Button>
      </div>
    </td>
  </tr>
);
