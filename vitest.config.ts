import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "webapp/src/**/*.test.ts"],
    environment: "node",
  },
});
