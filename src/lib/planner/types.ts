export type GoalStatus = "active" | "frozen" | "completed";

export type Goal = {
  id: string;
  name: string;
  targetAmount: number;
  /** Current accumulated amount in YNAB at calculation time (>= 0). */
  currentBalance: number;
  /** Normalized to the 1st of the deadline month. */
  deadline: Date;
  status: GoalStatus;
  ynabCategoryId: string | null;
  /** Used as a deterministic tie-breaker only, not as user-visible priority. */
  createdAt: Date;
};

export type YnabCategory = {
  id: string;
  name: string;
  group: string;
  balance: number;
  goalType: "TB" | "TBD" | "MF" | "NEED" | "DEBT" | null;
  goalTarget: number | null;
  /** YNAB-reported "still needed this month". */
  goalUnderFunded: number | null;
  goalTargetMonth: string | null;
};

export type ObligationItem = {
  categoryId: string;
  categoryName: string;
  amount: number;
};

export type MonthlyBudget = {
  plannedIncome: number;
  obligations: number;
  available: number;
  obligationBreakdown: ObligationItem[];
};

export type PlanInput = {
  goals: Goal[];
  budget: MonthlyBudget;
  /** Normalized to the 1st of the start month. */
  startMonth: Date;
  /** How many months ahead to plan (e.g. 120 for 10 years). */
  horizonMonths: number;
};

export type Allocation = {
  /** 1st of the month. */
  month: Date;
  /** goalId -> amount allocated this month. Goals not present this month are not in the map. */
  perGoal: Record<string, number>;
  /** Available - sum(perGoal). */
  unallocated: number;
};

export type Conflict =
  | {
      type: "unreachable";
      goalId: string;
      earliestAchievable: Date | null;
      detail: string;
    }
  | {
      type: "tied_deadline";
      goalIds: string[];
      deadline: Date;
      detail: string;
    };

export type PlanResult = {
  allocations: Allocation[];
  conflicts: Conflict[];
  /** goalId -> month in which the goal closes (remaining hits 0). null = never within horizon. */
  completionMap: Record<string, Date | null>;
  /** Goals auto-frozen because their deadline already passed without funding. */
  autoFrozenGoalIds: string[];
};

export const PLANNER_TYPES_MODULE = "planner-types";
