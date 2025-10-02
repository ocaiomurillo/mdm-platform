import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["**/*.spec.ts"],
    coverage: {
      reporter: ["text", "html"],
      enabled: false
    }
  }
});
