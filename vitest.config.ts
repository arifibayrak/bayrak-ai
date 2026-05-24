import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    passWithNoTests: true,
    // DB integration tests share a single Neon database; parallel file execution
    // causes TRUNCATE TABLE in one file to race with inserts in another, producing
    // FK violations. Run test files sequentially to ensure isolation.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
