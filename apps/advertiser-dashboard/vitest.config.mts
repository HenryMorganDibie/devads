import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig uses "jsx": "preserve" for Next.js; tests need JSX compiled.
  esbuild: { jsx: "automatic" },
  test: {
    include: ["__tests__/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
