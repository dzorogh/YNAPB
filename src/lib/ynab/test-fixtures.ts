import type { Tables } from "@/types/supabase";

export const TEST_USER_ID = "11111111-1111-1111-1111-111111111111";

export const createTestGoal = (
  overrides?: Partial<Tables<"goals">>,
): Tables<"goals"> => ({
  id: "goal-1",
  user_id: TEST_USER_ID,
  name: "Gazebo",
  target_amount: 1_000,
  deadline: "2026-08-01",
  ynab_category_id: null,
  status: "active",
  notes: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  last_sync_status: "synced",
  last_sync_error: null,
  last_synced_at: null,
  ...overrides,
});

export type MockYnabCategory = {
  id: string;
  name: string;
  category_group_id: string;
  goal_type: string | null;
  goal_target: number | null;
  goal_under_funded: number | null;
  hidden?: boolean;
  deleted?: boolean;
};

export const createMockYnabCategory = (
  overrides?: Partial<MockYnabCategory>,
): MockYnabCategory => ({
  id: "cat-1",
  name: "Gazebo (2026-08)",
  category_group_id: "group-1",
  goal_type: null,
  goal_target: null,
  goal_under_funded: null,
  ...overrides,
});

