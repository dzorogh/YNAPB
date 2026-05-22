import {
  getLatestYnabOperationSummary,
  getOperationRequestCount,
  getYnabOperationSummary,
  getYnabRequestLog,
  type YnabRequestLogEntry,
} from "./ynab-request-log";
import { YnabRequestError, toUserFacingYnabError } from "./ynab-request";

export type SyncErrorBody = {
  error: string;
  retryAfterSeconds?: number | null;
  requestCount?: number | null;
  ynabRequestLog?: YnabRequestLogEntry[];
};

const isDevelopment = (): boolean => process.env.NODE_ENV === "development";

export const buildSyncErrorBody = (
  error: unknown,
  fallbackMessage: string,
  operationId?: string | null,
): SyncErrorBody => {
  const resolvedOperationId =
    operationId ??
    (error instanceof YnabRequestError ? error.operationId : null) ??
    getLatestYnabOperationSummary()?.operationId ??
    null;

  const requestCount = getOperationRequestCount(resolvedOperationId);
  const retryAfterSeconds =
    error instanceof YnabRequestError ? error.retryAfterSeconds : null;

  const body: SyncErrorBody = {
    error: toUserFacingYnabError(
      error,
      fallbackMessage,
      retryAfterSeconds,
      requestCount,
    ),
    retryAfterSeconds,
    requestCount,
  };

  if (isDevelopment() && resolvedOperationId) {
    body.ynabRequestLog = getYnabRequestLog(resolvedOperationId);
  }

  if (resolvedOperationId) {
    const summary = getYnabOperationSummary(resolvedOperationId);
    if (summary && body.requestCount === null) {
      body.requestCount = summary.totalRequests;
    }
  }

  return body;
};
