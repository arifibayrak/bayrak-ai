import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  // @vitejs/plugin-react handles JSX in .tsx files imported by the test loader.
  // Required since Plan 11-04 introduced @react-pdf/renderer JSX components in
  // src/lib/pdf/hakedis-pdf.tsx — without this plugin, vitest's default rolldown
  // parser fails with "Failed to parse source ... jsx to preserve".
  plugins: [react()],
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: [
      "tests/**/*.test.ts",
      "tests/**/*.test.tsx",
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
    ],
    passWithNoTests: true,
    // DB integration tests share a single Neon database; parallel file execution
    // causes TRUNCATE TABLE in one file to race with inserts in another, producing
    // FK violations. Run test files sequentially to ensure isolation.
    fileParallelism: false,
    // Neon serverless test branch has variable latency, and the per-test TRUNCATE ... CASCADE
    // hook takes an ACCESS EXCLUSIVE lock across the whole FK graph. Under full-suite load
    // (serialized files) the default 5s test / 10s hook ceilings are too tight and flake on
    // timeouts — especially after Phase 14 widened the CASCADE graph with two new FK tables.
    // Give DB-backed hooks/tests real headroom; pure unit tests finish well under these anyway.
    testTimeout: 20000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
