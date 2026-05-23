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
