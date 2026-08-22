export type YnabOperationKind = "sync" | "push" | "goal-link" | "other";

export type YnabRequestLogEntry = {
  operationId: string;
  operation: YnabOperationKind;
  method: string;
  endpoint: string;
  attempt: 1 | 2;
  status: number;
  durationMs: number;
  retryAfterSeconds: number | null;
  timestamp: string;
};

export type YnabOperationOutcome = "ok" | "failed";

export type YnabOperationSummary = {
  operationId: string;
  operation: YnabOperationKind;
  outcome: YnabOperationOutcome;
  totalRequests: number;
  failedAt: string | null;
  durationMs: number;
  startedAt: string;
  finishedAt: string;
};

const MAX_LOG_ENTRIES = 100;

let nextOperationSequence = 0;
let activeOperationId: string | null = null;
const requestLog: YnabRequestLogEntry[] = [];
const operationSummaries = new Map<string, YnabOperationSummary>();
type OperationMeta = {
  operation: YnabOperationKind;
  startedAt: number;
  requestCount: number;
  failedAt: string | null;
};

const operationMeta = new Map<string, OperationMeta>();

const isDevelopment = (): boolean => process.env.NODE_ENV === "development";

const redactEndpoint = (endpoint: string): string =>
  endpoint
    .replace(/\/budgets\/[0-9a-f-]{36}/gi, "/budgets/{budgetId}")
    .replace(/\/plans\/[0-9a-f-]{36}/gi, "/plans/{planId}");

const formatRequestLine = (entry: YnabRequestLogEntry): string => {
  const retrySuffix =
    entry.retryAfterSeconds !== null
      ? ` retryAfter=${entry.retryAfterSeconds}`
      : "";
  const attemptSuffix = entry.attempt > 1 ? ` attempt=${entry.attempt}` : "";
  return `${entry.method} ${entry.endpoint} → ${entry.status} (${entry.durationMs}ms)${attemptSuffix}${retrySuffix}`;
};

const shouldLogRequestToConsole = (status: number): boolean =>
  status === 429 || isDevelopment();

const logRequestToConsole = (entry: YnabRequestLogEntry): void => {
  if (!shouldLogRequestToConsole(entry.status)) {
    return;
  }

  const line = formatRequestLine(entry);
  const prefix = `[YNAB] ${entry.operationId}`;
  if (entry.status === 429) {
    console.warn(`${prefix} ${line}`);
    return;
  }
  console.info(`${prefix} ${line}`);
};

const logSummaryToConsole = (summary: YnabOperationSummary): void => {
  const failedSuffix = summary.failedAt
    ? ` failedAt="${summary.failedAt}"`
    : "";
  const line = `summary ${summary.outcome} totalRequests=${summary.totalRequests} durationMs=${summary.durationMs}${failedSuffix}`;
  if (summary.outcome === "failed") {
    console.error(`[YNAB] ${summary.operationId} ${line}`);
    return;
  }
  if (isDevelopment()) {
    console.info(`[YNAB] ${summary.operationId} ${line}`);
  }
};

export const resetYnabRequestLog = (): void => {
  activeOperationId = null;
  requestLog.length = 0;
  operationSummaries.clear();
  operationMeta.clear();
  nextOperationSequence = 0;
};

export const getActiveYnabOperationId = (): string | null => activeOperationId;

export const startYnabOperation = (operation: YnabOperationKind): string => {
  nextOperationSequence += 1;
  const operationId = `${operation}:${nextOperationSequence.toString(36)}`;
  activeOperationId = operationId;
  operationMeta.set(operationId, {
    operation,
    startedAt: Date.now(),
    requestCount: 0,
    failedAt: null,
  });
  return operationId;
};

export const recordYnabRequest = (input: {
  method: string;
  endpoint: string;
  attempt: 1 | 2;
  status: number;
  durationMs: number;
  retryAfterSeconds?: number | null;
  operationId?: string | null;
}): YnabRequestLogEntry => {
  const operationId = input.operationId ?? activeOperationId ?? "unscoped:0";
  const meta = operationMeta.get(operationId);
  const operation = meta?.operation ?? "other";
  const entry: YnabRequestLogEntry = {
    operationId,
    operation,
    method: input.method,
    endpoint: redactEndpoint(input.endpoint),
    attempt: input.attempt,
    status: input.status,
    durationMs: input.durationMs,
    retryAfterSeconds: input.retryAfterSeconds ?? null,
    timestamp: new Date().toISOString(),
  };

  requestLog.push(entry);
  if (requestLog.length > MAX_LOG_ENTRIES) {
    requestLog.shift();
  }

  if (meta) {
    meta.requestCount += 1;
    if (input.status >= 400 && meta.failedAt === null) {
      meta.failedAt = entry.endpoint;
    }
  }

  logRequestToConsole(entry);
  return entry;
};

export const finishYnabOperation = (
  operationId: string,
  outcome: YnabOperationOutcome,
  failedAt?: string | null,
): YnabOperationSummary => {
  const meta = operationMeta.get(operationId);
  const finishedAt = Date.now();
  const summary: YnabOperationSummary = {
    operationId,
    operation: meta?.operation ?? "other",
    outcome,
    totalRequests: meta?.requestCount ?? 0,
    failedAt: failedAt ?? meta?.failedAt ?? null,
    durationMs: meta ? finishedAt - meta.startedAt : 0,
    startedAt: meta
      ? new Date(meta.startedAt).toISOString()
      : new Date(finishedAt).toISOString(),
    finishedAt: new Date(finishedAt).toISOString(),
  };

  operationSummaries.set(operationId, summary);
  operationMeta.delete(operationId);
  if (activeOperationId === operationId) {
    activeOperationId = null;
  }

  logSummaryToConsole(summary);
  return summary;
};

export const getYnabRequestLog = (
  operationId?: string | null,
): YnabRequestLogEntry[] => {
  if (!operationId) {
    return [...requestLog];
  }
  return requestLog.filter((entry) => entry.operationId === operationId);
};

export const getYnabOperationSummary = (
  operationId: string,
): YnabOperationSummary | null => operationSummaries.get(operationId) ?? null;

export const getOperationRequestCount = (
  operationId: string | null,
): number | null => {
  if (!operationId) {
    return null;
  }
  const activeMeta = operationMeta.get(operationId);
  if (activeMeta) {
    return activeMeta.requestCount;
  }
  return operationSummaries.get(operationId)?.totalRequests ?? null;
};

export const getLatestYnabOperationSummary =
  (): YnabOperationSummary | null => {
    const summaries = [...operationSummaries.values()];
    if (summaries.length === 0) {
      return null;
    }
    return summaries.at(-1) ?? null;
  };
