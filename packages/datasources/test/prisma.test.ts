import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "pglite-prisma-adapter";
import { afterAll, beforeAll, beforeEach, describe, expect, expectTypeOf, it } from "vitest";
import { type InferPrismaInsert, type InferPrismaSelect, PrismaDatasource, type PrismaModels, PrismaTransactor } from "../src/index.js";
import { itBehavesLikeADatasource } from "./contract.js";
import { PrismaClient, type User } from "./prisma/generated/client.js";

let client: PGlite;
let prisma: PrismaClient;
let datasource: PrismaDatasource<PrismaClient, "user">;

beforeAll(async () => {
  client = new PGlite();
  prisma = new PrismaClient({ adapter: new PrismaPGlite(client) });
  datasource = new PrismaDatasource(prisma, "user");
  await client.exec(`
    CREATE TABLE "User" (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      age INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
    );
    CREATE TABLE "Post" (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      "authorId" INTEGER NOT NULL REFERENCES "User"(id) ON DELETE CASCADE
    );
  `);
});

afterAll(async () => {
  await prisma.$disconnect();
  await client.close();
});

beforeEach(async () => {
  await client.exec('TRUNCATE "User", "Post" RESTART IDENTITY CASCADE');
});

describe("PrismaDatasource", () => {
  itBehavesLikeADatasource({
    datasource: () => datasource,
    transactor: () => new PrismaTransactor(prisma),
  });

  it("infers model names and row types from the generated client", () => {
    expectTypeOf<PrismaModels<PrismaClient>>().toEqualTypeOf<"user" | "post">();
    expectTypeOf<InferPrismaSelect<PrismaClient["user"]>>().toEqualTypeOf<User>();
    expectTypeOf<InferPrismaInsert<PrismaClient["user"]>>().toHaveProperty("name");
    expectTypeOf(datasource.list).returns.resolves.toEqualTypeOf<User[]>();
    // @ts-expect-error "$connect" is not a model
    expect(() => new PrismaDatasource(prisma, "$connect")).toBeDefined();
  });

  it("selects relations with nested filters", async () => {
    await datasource.store({ age: 30, name: "John" });
    await datasource.store({ age: 25, name: "Jane" });
    await prisma.post.createMany({
      data: [
        { authorId: 1, title: "Hello" },
        { authorId: 1, title: "World" },
        { authorId: 2, title: "Other" },
      ],
    });

    type UserWithPosts = User & { posts: { title: string }[] };
    const withPosts = new PrismaDatasource<PrismaClient, "user", UserWithPosts>(prisma, "user");

    const [john] = await withPosts.list({
      select: { id: true, posts: { order: { title: "desc" }, select: { title: true }, where: { title: { StartsWith: "h" } } } },
      where: { id: { Is: 1 } },
    });

    expect(john).toEqual({ id: 1, posts: [{ title: "Hello" }] });
  });

  it("keeps exact comparisons case-sensitive alongside case-insensitive text operators", async () => {
    await datasource.store({ age: 1, name: "John" });

    expect(await datasource.list({ where: { name: { Contains: "JOHN", IsNot: "john" } } })).toHaveLength(1);
    expect(await datasource.list({ where: { name: { Contains: "JOHN", IsNot: "John" } } })).toHaveLength(0);
  });
});
