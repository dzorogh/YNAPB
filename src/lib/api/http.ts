import { NextResponse } from "next/server";
import type { ZodError } from "zod";

export const unauthorizedResponse = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });

export const invalidPayloadResponse = (error: ZodError) =>
  NextResponse.json(
    { error: "Invalid payload", issues: error.flatten() },
    { status: 400 },
  );

export const invalidYnabConnectionResponse = () =>
  NextResponse.json(
    { error: "YNAB connection is not configured" },
    { status: 400 },
  );
