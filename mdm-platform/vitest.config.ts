import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["**/*.spec.ts", "**/*.spec.tsx"],
    environmentMatchGlobs: [["apps/web/**", "jsdom"]],
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      reporter: ["text", "html"],
      enabled: false
    }
  }
});
