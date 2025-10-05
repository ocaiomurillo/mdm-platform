import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const resolveAlias = (relativePath: string) => path.resolve(dirname, relativePath);

export default defineConfig({
  resolve: {
    alias: {
      "@mdm/types": resolveAlias("packages/types/src/index.ts"),
      "@mdm/utils": resolveAlias("packages/utils/src/index.ts")
    }
  },
  test: {
    globals: true,
    environment: "node",
    include: ["**/*.spec.ts", "**/*.spec.tsx"],
    environmentMatchGlobs: [["apps/web/**", "jsdom"]],
    setupFiles: [resolveAlias("vitest.setup.ts")],
    coverage: {
      reporter: ["text", "html"],
      enabled: false
    }
  }
});
