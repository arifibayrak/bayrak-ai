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
