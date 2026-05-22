import { http, HttpResponse } from "msw";

export const handlers = [
  http.get("*/__msw__/health", () => HttpResponse.json({ ok: true })),
];
