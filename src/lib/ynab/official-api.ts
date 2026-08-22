import {
  CategoriesApi,
  Configuration,
  MonthsApi,
  PlansApi,
  ResponseError,
} from "ynab";

import {
  createRateLimitedYnabFetch,
  YnabRequestError,
} from "@/lib/ynab/ynab-request";

export type OfficialYnabApis = {
  categories: CategoriesApi;
  months: MonthsApi;
  plans: PlansApi;
};

export const createOfficialYnabApis = (
  accessToken: string,
  fetchImpl?: typeof fetch,
): OfficialYnabApis => {
  const configuration = new Configuration({
    accessToken,
    fetchApi: createRateLimitedYnabFetch(fetchImpl),
  });
  return {
    categories: new CategoriesApi(configuration),
    months: new MonthsApi(configuration),
    plans: new PlansApi(configuration),
  };
};

export const runOfficialYnabCall = async <T>(
  run: () => Promise<T>,
): Promise<T> => {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ResponseError) {
      const retryAfterHeader = error.response.headers.get("Retry-After");
      const retryAfterSeconds =
        retryAfterHeader === null
          ? null
          : Number.parseInt(retryAfterHeader, 10);
      throw new YnabRequestError(error.response.status, {
        retryAfterSeconds:
          Number.isFinite(retryAfterSeconds) &&
            retryAfterSeconds !== null &&
            retryAfterSeconds > 0
            ? retryAfterSeconds
            : null,
      });
    }
    throw error;
  }
};
