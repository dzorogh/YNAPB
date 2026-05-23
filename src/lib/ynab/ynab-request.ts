import {
  getActiveYnabOperationId,
  getOperationRequestCount,
  recordYnabRequest,
} from "./ynab-request-log";

const YNAB_API_BASE = "https://api.ynab.com/v1";

const MIN_REQUEST_INTERVAL_MS = 400;

export class YnabRequestError extends Error {
  status: number;
  retryAfterSeconds: number | null;
  requestCount: number | null;
  operationId: string | null;

  constructor(
    status: number,
    options?: {
      message?: string;
      retryAfterSeconds?: number | null;
      operationId?: string | null;
    },
  ) {
    super(options?.message ?? `YNAB request failed with status ${status}`);
    this.name = "YnabRequestError";
    this.status = status;
    this.retryAfterSeconds = options?.retryAfterSeconds ?? null;
    this.operationId = options?.operationId ?? getActiveYnabOperationId();
    this.requestCount = getOperationRequestCount(this.operationId);
  }
}

const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

let requestChain: Promise<void> = Promise.resolve();
let lastRequestFinishedAt = 0;

const enqueueYnabRequest = async <T>(run: () => Promise<T>): Promise<T> => {
  const scheduled = requestChain.then(async () => {
    const elapsed = Date.now() - lastRequestFinishedAt;
    if (elapsed < MIN_REQUEST_INTERVAL_MS) {
      await sleep(MIN_REQUEST_INTERVAL_MS - elapsed);
    }
  });
  requestChain = scheduled.catch(() => undefined);
  await scheduled;

  try {
    return await run();
  } finally {
    lastRequestFinishedAt = Date.now();
  }
};

const parseRetryAfterSeconds = (response: Response): number | null => {
  const retryAfterHeader = response.headers.get("Retry-After");
  if (!retryAfterHeader) {
    return null;
  }
  const retryAfterSeconds = Number.parseInt(retryAfterHeader, 10);
  if (!Number.isFinite(retryAfterSeconds) || retryAfterSeconds <= 0) {
    return null;
  }
  return retryAfterSeconds;
};

const resolveRequestMethod = (options?: RequestInit): string =>
  typeof options?.method === "string" ? options.method.toUpperCase() : "GET";

const fetchYnabOnce = async (
  token: string,
  endpoint: string,
  options: RequestInit | undefined,
  attempt: 1 | 2,
): Promise<{ response: Response; retryAfterSeconds: number | null }> => {
  const method = resolveRequestMethod(options);
  const startedAt = Date.now();
  const response = await fetch(`${YNAB_API_BASE}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...options,
  });
  const retryAfterSeconds = parseRetryAfterSeconds(response);

  recordYnabRequest({
    method,
    endpoint,
    attempt,
    status: response.status,
    durationMs: Date.now() - startedAt,
    retryAfterSeconds,
  });

  return {
    response,
    retryAfterSeconds,
  };
};

export const requestYnab = async <TData>(
  token: string,
  endpoint: string,
  options?: RequestInit,
): Promise<TData> =>
  enqueueYnabRequest(async () => {
    let { response, retryAfterSeconds } = await fetchYnabOnce(
      token,
      endpoint,
      options,
      1,
    );

    if (response.status === 429) {
      if (retryAfterSeconds !== null) {
        await sleep(retryAfterSeconds * 1000);
        ({ response, retryAfterSeconds } = await fetchYnabOnce(
          token,
          endpoint,
          options,
          2,
        ));
      }

      if (response.status === 429) {
        throw new YnabRequestError(429, {
          retryAfterSeconds,
          operationId: getActiveYnabOperationId(),
        });
      }
    }

    if (!response.ok) {
      throw new YnabRequestError(response.status, {
        retryAfterSeconds,
        operationId: getActiveYnabOperationId(),
      });
    }

    const payload = (await response.json()) as { data: TData };
    return payload.data;
  });

const formatRateLimitMessage = (retryAfterSeconds: number | null): string => {
  if (retryAfterSeconds !== null && retryAfterSeconds > 0) {
    return `YNAB rate limit reached. Try again in about ${retryAfterSeconds} seconds.`;
  }

  return "YNAB rate limit reached. Wait a few minutes, then try again.";
};

const resolveBaseYnabErrorMessage = (
  error: unknown,
  fallbackMessage: string,
  retryAfterSeconds: number | null,
): string => {
  if (error instanceof YnabRequestError) {
    if (error.status === 429) {
      return formatRateLimitMessage(retryAfterSeconds);
    }

    return "Could not reach YNAB. Try again in a minute.";
  }

  if (!(error instanceof Error)) {
    return fallbackMessage;
  }

  if (error.message.includes("429")) {
    return formatRateLimitMessage(retryAfterSeconds);
  }

  if (error.message.startsWith("YNAB request failed with status")) {
    return "Could not reach YNAB. Try again in a minute.";
  }

  return error.message;
};

const appendRequestCountToMessage = (
  message: string,
  error: unknown,
  requestCount: number | null,
): string => {
  const shouldAppend =
    typeof requestCount === "number" &&
    requestCount > 0 &&
    (error instanceof YnabRequestError
      ? error.status === 429
      : message.includes("rate limit"));

  if (!shouldAppend) {
    return message;
  }

  return `${message} YNAB calls in this import: ${requestCount}.`;
};

export const toUserFacingYnabError = (
  error: unknown,
  fallbackMessage: string,
  retryAfterSeconds?: number | null,
  requestCount?: number | null,
): string => {
  const resolvedRetryAfter =
    retryAfterSeconds ??
    (error instanceof YnabRequestError ? error.retryAfterSeconds : null);
  const resolvedRequestCount =
    requestCount ??
    (error instanceof YnabRequestError ? error.requestCount : null);

  const message = resolveBaseYnabErrorMessage(
    error,
    fallbackMessage,
    resolvedRetryAfter,
  );

  return appendRequestCountToMessage(
    message,
    error,
    resolvedRequestCount,
  );
};
