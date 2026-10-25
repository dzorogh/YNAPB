import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

const request = () => new NextRequest("http://localhost:3002/auth/dev-login");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("dev login configuration", () => {
  it("explains missing local configuration during development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_LOGIN_EMAIL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

    const response = await GET(request());

    expect(response.status).toBe(503);
    await expect(response.text()).resolves.toContain(
      "missing DEV_LOGIN_EMAIL and SUPABASE_SERVICE_ROLE_KEY",
    );
  });

  it("names only the missing variable", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_LOGIN_EMAIL", "dev@example.test");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");

    const response = await GET(request());

    expect(response.status).toBe(503);
    await expect(response.text()).resolves.toContain(
      "missing SUPABASE_SERVICE_ROLE_KEY",
    );
  });

  it("remains hidden outside development", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEV_LOGIN_EMAIL", "dev@example.test");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role");

    const response = await GET(request());

    expect(response.status).toBe(404);
  });
});
