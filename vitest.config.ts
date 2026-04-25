import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["tests/e2e/**", "node_modules/**", ".next/**"],
    globals: true,
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      exclude: [
        "tests/**",
        "**/*.test.*",
        "src/test-setup.ts",
        "src/types/supabase.ts",
        "src/lib/ynab/client.ts",
        "src/lib/ynab/push-mf.ts",
      ],
      thresholds: {
        statements: 80,
        lines: 80,
        functions: 80,
        branches: 70,
      },
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
