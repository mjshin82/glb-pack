import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 20000,
    passWithNoTests: true,
    environmentMatchGlobs: [
      ["tests/unit/web/**", "happy-dom"],
      ["tests/integration/web-pipeline.test.ts", "happy-dom"],
    ],
  },
});
