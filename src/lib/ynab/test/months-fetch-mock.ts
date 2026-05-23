type MonthListEntry = { month: string; income: number };

export const countMonthDetailCalls = (
  fetchMock: { mock: { calls: Array<[RequestInfo]> } },
  matcher: (url: string) => boolean = (url) =>
    /\/months\/\d{4}-\d{2}-\d{2}$/.test(url),
): number =>
  fetchMock.mock.calls.filter(([url]) => matcher(String(url))).length;

export const createYnabMonthsFetchMock = (params: {
  months: MonthListEntry[];
  detailMonthMatcher?: (url: string) => boolean;
  detailCategories?: Array<{ id: string; budgeted: number; activity: number }>;
}) => {
  const detailMatcher =
    params.detailMonthMatcher ??
    ((url: string) => /\/months\/\d{4}-\d{2}-\d{2}$/.test(url));

  return async (input: RequestInfo) => {
    const url = String(input);
    if (url.endsWith("/months")) {
      return new Response(JSON.stringify({ data: { months: params.months } }), {
        status: 200,
      });
    }

    if (detailMatcher(url)) {
      const month = url.split("/").at(-1) ?? "";
      return new Response(
        JSON.stringify({
          data: {
            month: {
              month,
              categories: params.detailCategories ?? [
                { id: "cat-1", budgeted: 100, activity: -50 },
              ],
            },
          },
        }),
        { status: 200 },
      );
    }

    return new Response("not found", { status: 404 });
  };
};
