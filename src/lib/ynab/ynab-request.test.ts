import { afterEach, describe, expect, it, vi } from "vitest";

import { resetYnabRequestLog, startYnabOperation } from "./ynab-request-log";
import { YnabRequestError, requestYnab } from "./ynab-request";

describe("requestYnab", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetYnabRequestLog();
  });

  it("records each HTTP attempt in the request log", async () => {
    const operationId = startYnabOperation("sync");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ data: { ok: true } }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await requestYnab("token", "/budgets/test");

    const { getYnabRequestLog } = await import("./ynab-request-log");
    const entries = getYnabRequestLog(operationId);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      method: "GET",
      endpoint: "/budgets/test",
      status: 200,
      attempt: 1,
    });
  });

  it("retries once after Retry-After and succeeds", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { name: "too_many_requests" } }), {
          status: 429,
          headers: { "Retry-After": "1" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { ok: true } }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const requestPromise = requestYnab("token", "/budgets/test");
    await vi.runAllTimersAsync();
    await expect(requestPromise).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("fails fast on 429 when Retry-After is missing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { name: "too_many_requests" } }), {
        status: 429,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestYnab("token", "/budgets/test")).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws YnabRequestError when rate limit persists after one retry", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { name: "too_many_requests" } }), {
        status: 429,
        headers: { "Retry-After": "1" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const requestPromise = requestYnab("token", "/budgets/test");
    const assertion =
      expect(requestPromise).rejects.toBeInstanceOf(YnabRequestError);
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
