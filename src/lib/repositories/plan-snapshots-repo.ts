import { z } from "zod";

import type { PlanResult } from "@/lib/planner/types";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Json, Tables } from "@/types/supabase";

type PlanSnapshotRow = Tables<"plan_snapshots">;

export const DEFAULT_PLAN_SNAPSHOT_KEEP = 100;

const userIdSchema = z.uuid();
const keepSchema = z.number().int().min(0);

const createPlanSnapshotSchema = z.object({
  inputsHash: z.string().trim().min(1),
  result: z.custom<PlanResult>(),
});

export type CreatePlanSnapshotInput = z.infer<typeof createPlanSnapshotSchema>;

const assertUserId = (userId: string): string => userIdSchema.parse(userId);
const serializePlanResult = (result: PlanResult): Json =>
  JSON.parse(JSON.stringify(result)) as Json;

const createPlanSnapshot = async (
  userId: string,
  input: CreatePlanSnapshotInput,
): Promise<PlanSnapshotRow> => {
  const parsedUserId = assertUserId(userId);
  const parsedInput = createPlanSnapshotSchema.parse(input);
  const supabase = await getSupabaseServerClient();

  const { data, error } = await supabase
    .from("plan_snapshots")
    .insert({
      user_id: parsedUserId,
      inputs_hash: parsedInput.inputsHash,
      result: serializePlanResult(parsedInput.result),
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to create plan snapshot: ${error.message}`);
  }

  return data;
};

const trimPlanSnapshots = async (
  userId: string,
  keep = DEFAULT_PLAN_SNAPSHOT_KEEP,
): Promise<number> => {
  const parsedUserId = assertUserId(userId);
  const parsedKeep = keepSchema.parse(keep);
  const supabase = await getSupabaseServerClient();

  const { data, error } = await supabase
    .from("plan_snapshots")
    .select("id")
    .eq("user_id", parsedUserId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (error) {
    throw new Error(`Failed to list plan snapshots for trim: ${error.message}`);
  }

  if (data.length <= parsedKeep) {
    return 0;
  }

  const snapshotIdsToDelete = data
    .slice(parsedKeep)
    .map((snapshot) => snapshot.id);
  if (snapshotIdsToDelete.length === 0) {
    return 0;
  }

  const { error: deleteError } = await supabase
    .from("plan_snapshots")
    .delete()
    .eq("user_id", parsedUserId)
    .in("id", snapshotIdsToDelete);

  if (deleteError) {
    throw new Error(`Failed to trim plan snapshots: ${deleteError.message}`);
  }

  return snapshotIdsToDelete.length;
};

export const createAndTrimPlanSnapshot = async (
  userId: string,
  input: CreatePlanSnapshotInput,
  keep = DEFAULT_PLAN_SNAPSHOT_KEEP,
): Promise<PlanSnapshotRow> => {
  const createdSnapshot = await createPlanSnapshot(userId, input);
  await trimPlanSnapshots(userId, keep);
  return createdSnapshot;
};
