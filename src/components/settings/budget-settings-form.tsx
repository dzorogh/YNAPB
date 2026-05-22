"use client";
/* eslint-disable max-lines-per-function */

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toUserFacingYnabError } from "@/lib/ynab/ynab-request";

const DEFAULT_BASELINE_MONTHS = 6;
const SETTINGS_ENDPOINT = "/api/settings";
const SAVE_FAILED_TITLE = "Save failed";
const LOAD_FAILED_TITLE = "Load failed";
const UNEXPECTED_SAVE_ERROR_MESSAGE =
  "Unexpected network error while saving settings.";
const VALIDATION_ERROR_TITLE = "Validation error";

type StatusTone = "success" | "error";

type InlineStatus = {
  tone: StatusTone;
  title: string;
  message: string;
} | null;

type SettingsPayload = {
  token?: string;
  budgetId?: string;
  plannedIncome?: number;
  baselineMonths?: number;
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

type IncomeHistoryItem = {
  month: string;
  income: number;
};

type SettingsResponse = {
  budgetId: string;
  hasYnabConnection: boolean;
  plannedIncome: number | null;
  baselineMonths: number;
  incomeHistory: IncomeHistoryItem[];
  historicalAverageIncome: number | null;
  syncedAt: string | null;
};

const parseErrorMessage = async (
  response: Response,
  fallbackMessage: string,
): Promise<string> => {
  try {
    const data = (await response.json()) as ErrorResponse;
    if (typeof data.error === "string" && data.error.length > 0) {
      return toUserFacingYnabError(new Error(data.error), fallbackMessage);
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
  const {
    token,
    budgetId,
    plannedIncome,
    baselineMonths,
    historicalAverageIncome,
    incomeHistoryMonths,
    isSaving,
    isSyncing,
    canSubmit,
    setToken,
    setBudgetId,
    setPlannedIncome,
    setBaselineMonths,
    handleSaveYnabSettings,
    handleSaveIncomeSettings,
    handleSyncYnab,
  } = useBudgetSettingsForm();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="space-y-1">
          <CardTitle>YNAB settings</CardTitle>
          <p className="text-sm text-muted-foreground">
            Update YNAB token and budget id, then run manual sync.
          </p>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(event) => void handleSaveYnabSettings(event)}
            className="space-y-4"
          >
            <YnabSettingsFields
              token={token}
              budgetId={budgetId}
              canSubmit={canSubmit}
              onTokenChange={setToken}
              onBudgetIdChange={setBudgetId}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={!canSubmit}>
                {isSaving ? "Saving..." : "Save YNAB settings"}
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

      <Card>
        <CardHeader className="space-y-1">
          <CardTitle>Income settings</CardTitle>
          <p className="text-sm text-muted-foreground">
            Configure planner income and baseline window.
          </p>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(event) => void handleSaveIncomeSettings(event)}
            className="space-y-4"
          >
            <IncomeSettingsFields
              plannedIncome={plannedIncome}
              baselineMonths={baselineMonths}
              canSubmit={canSubmit}
              onPlannedIncomeChange={setPlannedIncome}
              onBaselineMonthsChange={setBaselineMonths}
            />
            <HistoricalIncomeSection
              historicalAverageIncome={historicalAverageIncome}
              incomeHistoryMonths={incomeHistoryMonths}
              canSubmit={canSubmit}
              onUseAverage={() =>
                setPlannedIncome(
                  historicalAverageIncome === null
                    ? ""
                    : String(Math.round(historicalAverageIncome)),
                )
              }
            />
            <Button type="submit" disabled={!canSubmit}>
              {isSaving ? "Saving..." : "Save income settings"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

const useBudgetSettingsForm = () => {
  const [token, setToken] = useState("");
  const [budgetId, setBudgetId] = useState("");
  const [plannedIncome, setPlannedIncome] = useState("");
  const [baselineMonths, setBaselineMonths] = useState(
    String(DEFAULT_BASELINE_MONTHS),
  );
  const [historicalAverageIncome, setHistoricalAverageIncome] = useState<
    number | null
  >(null);
  const [incomeHistoryMonths, setIncomeHistoryMonths] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [hasYnabConnection, setHasYnabConnection] = useState(false);
  const [status, setStatus] = useState<InlineStatus>(null);

  const canSubmit = !isLoading && !isSaving && !isSyncing;

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(SETTINGS_ENDPOINT, { method: "GET" });
      if (!response.ok) {
        const message = await parseErrorMessage(
          response,
          "Failed to load settings.",
        );
        setStatus({ tone: "error", title: LOAD_FAILED_TITLE, message });
        return;
      }
      const data = (await response.json()) as SettingsResponse;
      setBudgetId(data.budgetId);
      setHasYnabConnection(data.hasYnabConnection);
      setBaselineMonths(String(data.baselineMonths));
      setPlannedIncome(
        data.plannedIncome === null ? "" : String(data.plannedIncome),
      );
      setIncomeHistoryMonths(data.incomeHistory.length);
      setHistoricalAverageIncome(data.historicalAverageIncome);
    } catch {
      setStatus({
        tone: "error",
        title: LOAD_FAILED_TITLE,
        message: "Unexpected network error while loading settings.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  useEffect(() => {
    if (!status) {
      return;
    }

    if (status.tone === "error") {
      toast.error(status.title, { description: status.message });
    } else {
      toast.success(status.title, { description: status.message });
    }
    setStatus(null);
  }, [status]);

  const handleSaveYnabSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitYnabSettings({
      token,
      budgetId,
      hasYnabConnection,
      setStatus,
      setIsSaving,
    });
  };

  const handleSaveIncomeSettings = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    await submitIncomeSettings({
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
    await loadSettings();
  };

  return {
    token,
    budgetId,
    plannedIncome,
    baselineMonths,
    historicalAverageIncome,
    incomeHistoryMonths,
    isSaving,
    isSyncing,
    hasYnabConnection,
    status,
    canSubmit,
    setToken,
    setBudgetId,
    setPlannedIncome,
    setBaselineMonths,
    handleSaveYnabSettings,
    handleSaveIncomeSettings,
    handleSyncYnab,
  };
};

type HistoricalIncomeSectionProps = {
  historicalAverageIncome: number | null;
  incomeHistoryMonths: number;
  canSubmit: boolean;
  onUseAverage: () => void;
};

const HistoricalIncomeSection = ({
  historicalAverageIncome,
  incomeHistoryMonths,
  canSubmit,
  onUseAverage,
}: HistoricalIncomeSectionProps) => (
  <div className="rounded-md border p-3">
    <p className="text-sm font-medium">Historical income</p>
    <p className="mt-1 text-sm text-muted-foreground">
      {historicalAverageIncome === null
        ? "No synced income history yet. Run Sync YNAB first."
        : `Average for last ${incomeHistoryMonths} month(s): ${Math.round(historicalAverageIncome)}`}
    </p>
    <Button
      type="button"
      variant="secondary"
      className="mt-3"
      onClick={onUseAverage}
      disabled={!canSubmit || historicalAverageIncome === null}
    >
      Use historical average
    </Button>
  </div>
);

type YnabSettingsFieldsProps = {
  token: string;
  budgetId: string;
  canSubmit: boolean;
  onTokenChange: (value: string) => void;
  onBudgetIdChange: (value: string) => void;
};

const YnabSettingsFields = ({
  token,
  budgetId,
  canSubmit,
  onTokenChange,
  onBudgetIdChange,
}: YnabSettingsFieldsProps) => (
  <>
    <div className="space-y-2">
      <Label htmlFor="ynab-token">YNAB token</Label>
      <Input
        id="ynab-token"
        type="password"
        value={token}
        onChange={(event) => onTokenChange(event.target.value)}
        autoComplete="off"
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
  </>
);

type IncomeSettingsFieldsProps = {
  plannedIncome: string;
  baselineMonths: string;
  canSubmit: boolean;
  onPlannedIncomeChange: (value: string) => void;
  onBaselineMonthsChange: (value: string) => void;
};

const IncomeSettingsFields = ({
  plannedIncome,
  baselineMonths,
  canSubmit,
  onPlannedIncomeChange,
  onBaselineMonthsChange,
}: IncomeSettingsFieldsProps) => (
  <>
    <div className="space-y-2">
      <Label htmlFor="planned-income">Planned monthly income</Label>
      <Input
        id="planned-income"
        type="number"
        min={0}
        step={1}
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

type SubmitYnabSettingsParams = {
  token: string;
  budgetId: string;
  hasYnabConnection: boolean;
  setStatus: (status: InlineStatus) => void;
  setIsSaving: (isSaving: boolean) => void;
};

const submitYnabSettings = async ({
  token,
  budgetId,
  hasYnabConnection,
  setStatus,
  setIsSaving,
}: SubmitYnabSettingsParams) => {
  setStatus(null);
  const trimmedToken = token.trim();
  const trimmedBudgetId = budgetId.trim();
  if (!trimmedBudgetId) {
    setStatus({
      tone: "error",
      title: VALIDATION_ERROR_TITLE,
      message: "Budget id is required.",
    });
    return;
  }

  if (!trimmedToken && !hasYnabConnection) {
    setStatus({
      tone: "error",
      title: VALIDATION_ERROR_TITLE,
      message: "YNAB token is required for initial connection.",
    });
    return;
  }

  setIsSaving(true);
  try {
    const payload: SettingsPayload = {
      budgetId: trimmedBudgetId,
    };
    if (trimmedToken) {
      payload.token = trimmedToken;
    }
    const response = await fetch(SETTINGS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const message = await parseErrorMessage(
        response,
        "Failed to save settings.",
      );
      setStatus({ tone: "error", title: SAVE_FAILED_TITLE, message });
      return;
    }
    setStatus({
      tone: "success",
      title: "YNAB settings saved",
      message: "YNAB credentials were updated.",
    });
  } catch {
    setStatus({
      tone: "error",
      title: SAVE_FAILED_TITLE,
      message: UNEXPECTED_SAVE_ERROR_MESSAGE,
    });
  } finally {
    setIsSaving(false);
  }
};

type SubmitIncomeSettingsParams = {
  plannedIncome: string;
  baselineMonths: string;
  setStatus: (status: InlineStatus) => void;
  setIsSaving: (isSaving: boolean) => void;
};

const submitIncomeSettings = async ({
  plannedIncome,
  baselineMonths,
  setStatus,
  setIsSaving,
}: SubmitIncomeSettingsParams) => {
  setStatus(null);
  const parsedPlannedIncome = parseNonNegativeNumber(plannedIncome);
  const parsedBaselineMonths = parsePositiveInteger(
    baselineMonths,
    DEFAULT_BASELINE_MONTHS,
  );

  if (parsedPlannedIncome === null) {
    setStatus({
      tone: "error",
      title: VALIDATION_ERROR_TITLE,
      message: "Planned monthly income must be a non-negative number.",
    });
    return;
  }

  setIsSaving(true);
  try {
    const payload: SettingsPayload = {
      plannedIncome: parsedPlannedIncome,
      baselineMonths: parsedBaselineMonths,
    };
    const response = await fetch(SETTINGS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const message = await parseErrorMessage(
        response,
        "Failed to save income settings.",
      );
      setStatus({ tone: "error", title: SAVE_FAILED_TITLE, message });
      return;
    }
    setStatus({
      tone: "success",
      title: "Income settings saved",
      message: "Planned income configuration was updated.",
    });
  } catch {
    setStatus({
      tone: "error",
      title: SAVE_FAILED_TITLE,
      message: UNEXPECTED_SAVE_ERROR_MESSAGE,
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

const syncYnab = async ({
  baselineMonths,
  setStatus,
  setIsSyncing,
}: SyncYnabParams) => {
  setStatus(null);
  const payload: SyncPayload = {
    baselineMonths: parsePositiveInteger(
      baselineMonths,
      DEFAULT_BASELINE_MONTHS,
    ),
  };

  setIsSyncing(true);
  try {
    const response = await fetch("/api/ynab/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const message = await parseErrorMessage(
        response,
        "Failed to sync YNAB data.",
      );
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
