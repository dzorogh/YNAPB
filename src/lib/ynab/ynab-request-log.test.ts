import { afterEach, describe, expect, it } from "vitest";

import {
  finishYnabOperation,
  getOperationRequestCount,
  getYnabRequestLog,
  getYnabOperationSummary,
  recordYnabRequest,
  resetYnabRequestLog,
  startYnabOperation,
} from "./ynab-request-log";

describe("ynab-request-log", () => {
  afterEach(() => {
    resetYnabRequestLog();
  });

  it("tracks requests under an operation and finishes with summary", () => {
    const operationId = startYnabOperation("sync");

    recordYnabRequest({
      method: "GET",
      endpoint: "/budgets/{budgetId}/categories",
      attempt: 1,
      status: 200,
      durationMs: 120,
    });
    recordYnabRequest({
      method: "GET",
      endpoint: "/budgets/{budgetId}/months",
      attempt: 1,
      status: 429,
      durationMs: 80,
      retryAfterSeconds: 30,
    });

    expect(getOperationRequestCount(operationId)).toBe(2);

    const summary = finishYnabOperation(
      operationId,
      "failed",
      "/budgets/{budgetId}/months",
    );

    expect(summary).toMatchObject({
      operationId,
      operation: "sync",
      outcome: "failed",
      totalRequests: 2,
      failedAt: "/budgets/{budgetId}/months",
    });
    expect(getYnabRequestLog(operationId)).toHaveLength(2);
    expect(getYnabOperationSummary(operationId)).toEqual(summary);
  });

  it("redacts budget id in logged endpoints", () => {
    const operationId = startYnabOperation("sync");
    recordYnabRequest({
      method: "GET",
      endpoint: "/budgets/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/categories",
      attempt: 1,
      status: 200,
      durationMs: 50,
      operationId,
    });

    expect(getYnabRequestLog(operationId)[0]?.endpoint).toBe(
      "/budgets/{budgetId}/categories",
    );
  });
});
