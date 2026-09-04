import { defineConfig } from "prisma/config";

// Test-only schema used to generate a real Prisma client that the datasource is checked against.
export default defineConfig({
  schema: "test/prisma/schema.prisma",
});
