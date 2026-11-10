import { defineConfig } from "vitest/config";

const exclude = ["tests/e2e/**", "node_modules/**", "dist/**"];

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          environment: "node",
          include: ["tests/**/*.test.ts"],
          exclude: [...exclude, "tests/islands/**"],
        },
      },
      {
        test: {
          name: "islands",
          environment: "happy-dom",
          include: ["tests/islands/**/*.test.ts"],
          exclude,
        },
      },
    ],
  },
});
