import { defineConfig } from "vitest/config";
import path from "node:path";

// Unit tests for the logic that handles money, dates and stock. They run in
// Node with no database: tests that need Supabase use tests/helpers/fakeSupabase.
export default defineConfig({
    resolve: { alias: { "@": path.resolve(__dirname) } },
    test: {
        include: ["tests/**/*.test.ts"],
        environment: "node",
    },
});
