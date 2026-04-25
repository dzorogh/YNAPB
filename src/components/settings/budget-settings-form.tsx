"use client";

import { useState, type FormEvent } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const DEFAULT_BASELINE_MONTHS = 6;

type StatusTone = "success" | "error";

type InlineStatus = {
  tone: StatusTone;
  title: string;
  message: string;
} | null;

type SettingsPayload = {
  token: string;
  budgetId: string;
  plannedIncome: number;
  baselineMonths: number;
};

type SyncPayload = {
  baselineMonths: number;
};

type SyncResponse = {
  categoriesCount: number;
  incomeMonths: number;
  syncedAt: string;
};

type ErrorResponse = {
  error?: string;
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

const parsePositiveInteger = (value: string, fallback: number): number => {
  const numericValue = Number.parseInt(value, 10);
  if (!Number.isFinite(numericValue) || numericValue < 1) {
    return fallback;
  }
  return numericValue;
};

const parseNonNegativeNumber = (value: string): number | null => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return null;
  }
  return numericValue;
};

export const BudgetSettingsForm = () => {
  const [token, setToken] = useState("");
  const [budgetId, setBudgetId] = useState("");
  const [plannedIncome, setPlannedIncome] = useState("");
  const [baselineMonths, setBaselineMonths] = useState(String(DEFAULT_BASELINE_MONTHS));
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [status, setStatus] = useState<InlineStatus>(null);

  const canSubmit = !isSaving && !isSyncing;
  const handleSaveSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitSettings({
      token,
      budgetId,
      plannedIncome,
      baselineMonths,
      setStatus,
      setIsSaving,
    });
  };

  const handleSyncYnab = async () => {
    await syncYnab({
      baselineMonths,
      setStatus,
      setIsSyncing,
    });
  };

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle>YNAB connection</CardTitle>
        <p className="text-sm text-muted-foreground">
          Save credentials and planner income configuration.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={(event) => void handleSaveSettings(event)} className="space-y-4">
          <SettingsFields
            token={token}
            budgetId={budgetId}
            plannedIncome={plannedIncome}
            baselineMonths={baselineMonths}
            canSubmit={canSubmit}
            onTokenChange={setToken}
            onBudgetIdChange={setBudgetId}
            onPlannedIncomeChange={setPlannedIncome}
            onBaselineMonthsChange={setBaselineMonths}
          />
          {status ? (
            <Alert variant={status.tone === "error" ? "destructive" : "default"}>
              <AlertTitle>{status.title}</AlertTitle>
              <AlertDescription>{status.message}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!canSubmit}>
              {isSaving ? "Saving..." : "Save settings"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleSyncYnab()}
              disabled={!canSubmit}
            >
              {isSyncing ? "Syncing..." : "Sync YNAB"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

type SettingsFieldsProps = {
  token: string;
  budgetId: string;
  plannedIncome: string;
  baselineMonths: string;
  canSubmit: boolean;
  onTokenChange: (value: string) => void;
  onBudgetIdChange: (value: string) => void;
  onPlannedIncomeChange: (value: string) => void;
  onBaselineMonthsChange: (value: string) => void;
};

const SettingsFields = ({
  token,
  budgetId,
  plannedIncome,
  baselineMonths,
  canSubmit,
  onTokenChange,
  onBudgetIdChange,
  onPlannedIncomeChange,
  onBaselineMonthsChange,
}: SettingsFieldsProps) => (
  <>
    <div className="space-y-2">
      <Label htmlFor="ynab-token">YNAB token</Label>
      <Input
        id="ynab-token"
        type="password"
        value={token}
        onChange={(event) => onTokenChange(event.target.value)}
        autoComplete="off"
        required
        disabled={!canSubmit}
      />
    </div>
    <div className="space-y-2">
      <Label htmlFor="ynab-budget-id">Budget id</Label>
      <Input
        id="ynab-budget-id"
        type="text"
        value={budgetId}
        onChange={(event) => onBudgetIdChange(event.target.value)}
        required
        disabled={!canSubmit}
      />
    </div>
    <div className="space-y-2">
      <Label htmlFor="planned-income">Planned monthly income</Label>
      <Input
        id="planned-income"
        type="number"
        min={0}
        step="0.01"
        value={plannedIncome}
        onChange={(event) => onPlannedIncomeChange(event.target.value)}
        required
        disabled={!canSubmit}
      />
    </div>
    <div className="space-y-2">
      <Label htmlFor="baseline-months">Baseline months</Label>
      <Input
        id="baseline-months"
        type="number"
        min={1}
        max={36}
        step={1}
        value={baselineMonths}
        onChange={(event) => onBaselineMonthsChange(event.target.value)}
        required
        disabled={!canSubmit}
      />
    </div>
  </>
);

type SubmitSettingsParams = {
  token: string;
  budgetId: string;
  plannedIncome: string;
  baselineMonths: string;
  setStatus: (status: InlineStatus) => void;
  setIsSaving: (isSaving: boolean) => void;
};

const submitSettings = async ({
  token,
  budgetId,
  plannedIncome,
  baselineMonths,
  setStatus,
  setIsSaving,
}: SubmitSettingsParams) => {
  setStatus(null);
  const trimmedToken = token.trim();
  const trimmedBudgetId = budgetId.trim();
  const parsedPlannedIncome = parseNonNegativeNumber(plannedIncome);
  const parsedBaselineMonths = parsePositiveInteger(baselineMonths, DEFAULT_BASELINE_MONTHS);

  if (!trimmedToken || !trimmedBudgetId) {
    setStatus({
      tone: "error",
      title: "Validation error",
      message: "YNAB token and budget id are required.",
    });
    return;
  }

  if (parsedPlannedIncome === null) {
    setStatus({
      tone: "error",
      title: "Validation error",
      message: "Planned monthly income must be a non-negative number.",
    });
    return;
  }

  setIsSaving(true);
  try {
    const payload: SettingsPayload = {
      token: trimmedToken,
      budgetId: trimmedBudgetId,
      plannedIncome: parsedPlannedIncome,
      baselineMonths: parsedBaselineMonths,
    };
    const response = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const message = await parseErrorMessage(response, "Failed to save settings.");
      setStatus({ tone: "error", title: "Save failed", message });
      return;
    }
    setStatus({
      tone: "success",
      title: "Settings saved",
      message: "YNAB credentials and income settings were updated.",
    });
  } catch {
    setStatus({
      tone: "error",
      title: "Save failed",
      message: "Unexpected network error while saving settings.",
    });
  } finally {
    setIsSaving(false);
  }
};

type SyncYnabParams = {
  baselineMonths: string;
  setStatus: (status: InlineStatus) => void;
  setIsSyncing: (isSyncing: boolean) => void;
};

const syncYnab = async ({ baselineMonths, setStatus, setIsSyncing }: SyncYnabParams) => {
  setStatus(null);
  const payload: SyncPayload = {
    baselineMonths: parsePositiveInteger(baselineMonths, DEFAULT_BASELINE_MONTHS),
  };

  setIsSyncing(true);
  try {
    const response = await fetch("/api/ynab/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const message = await parseErrorMessage(response, "Failed to sync YNAB data.");
      setStatus({ tone: "error", title: "Sync failed", message });
      return;
    }

    const data = (await response.json()) as SyncResponse;
    setStatus({
      tone: "success",
      title: "Sync completed",
      message: `Updated ${data.categoriesCount} categories and ${data.incomeMonths} income months.`,
    });
  } catch {
    setStatus({
      tone: "error",
      title: "Sync failed",
      message: "Unexpected network error while syncing YNAB.",
    });
  } finally {
    setIsSyncing(false);
  }
};
