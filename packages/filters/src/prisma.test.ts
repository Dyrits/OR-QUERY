import { describe, expect, it } from "vitest";
import { buildPrismaFilters, buildPrismaOrder, buildPrismaSelect, buildPrismaWhere } from "./prisma/index.js";
import type { QueryFilters } from "./types.js";

type Post = {
  id: number;
  title: string;
  published: boolean;
};

type User = {
  id: number;
  name: string;
  email: string | null;
  age: number;
  status: string;
  role: string;
  createdAt: Date;
  posts: Post[];
};

describe("buildPrismaWhere", () => {
  it("returns an empty object for undefined or empty input", () => {
    expect(buildPrismaWhere<User>(undefined)).toEqual({});
    expect(buildPrismaWhere<User>({})).toEqual({});
  });

  it.each([
    ["Is", { name: { Is: "john" } }, { name: { equals: "john" } }],
    ["IsNot", { status: { IsNot: "inactive" } }, { status: { not: "inactive" } }],
    ["GT", { age: { GT: 18 } }, { age: { gt: 18 } }],
    ["GTE", { age: { GTE: 21 } }, { age: { gte: 21 } }],
    ["LT", { age: { LT: 65 } }, { age: { lt: 65 } }],
    ["LTE", { age: { LTE: 100 } }, { age: { lte: 100 } }],
    ["In", { status: { In: ["active", "pending"] } }, { status: { in: ["active", "pending"] } }],
    ["NotIn", { id: { NotIn: [1, 2] } }, { id: { notIn: [1, 2] } }],
    ["Contains", { name: { Contains: "john" } }, { name: { contains: "john", mode: "insensitive" } }],
    ["StartsWith", { email: { StartsWith: "admin" } }, { email: { mode: "insensitive", startsWith: "admin" } }],
    ["EndsWith", { email: { EndsWith: "@example.com" } }, { email: { endsWith: "@example.com", mode: "insensitive" } }],
    ["IsNull", { email: { IsNull: true } }, { email: { equals: null } }],
    ["IsNotNull", { email: { IsNotNull: true } }, { email: { not: null } }],
  ] as const)("maps %s", (_operator, where, expected) => {
    expect(buildPrismaWhere<User>(where)).toEqual(expected);
  });

  it("escapes LIKE wildcards in text operators", () => {
    expect(buildPrismaWhere<User>({ name: { Contains: "50%_off" } })).toEqual({ name: { contains: "50\\%\\_off", mode: "insensitive" } });
  });

  it("isolates case-insensitive text operators, because Prisma applies mode to every operator of a field", () => {
    expect(buildPrismaWhere<User>({ name: { Contains: "OHN", IsNot: "John" } })).toEqual({
      AND: [{ name: { contains: "OHN", mode: "insensitive" } }],
      name: { not: "John" },
    });
  });

  it("keeps text and exact operators together when case sensitivity is off", () => {
    expect(buildPrismaWhere<User>({ name: { Contains: "OHN", IsNot: "John" } }, { caseInsensitive: false })).toEqual({
      name: { contains: "OHN", not: "John" },
    });
  });

  it("applies flag operators unless they are false, so JSON payloads using null keep working", () => {
    expect(buildPrismaWhere<User>({ email: { IsNull: null as unknown as boolean } })).toEqual({ email: { equals: null } });
    expect(buildPrismaWhere<User>({ email: { IsNotNull: false, IsNull: false } })).toEqual({});
  });

  it("rejects unknown operators instead of dropping them", () => {
    expect(() => buildPrismaWhere<User>({ name: { Like: "john" } as never })).toThrow('Unknown operator "Like"');
  });

  it("supports case-sensitive text matching when requested", () => {
    expect(buildPrismaWhere<User>({ name: { Contains: "john" } }, { caseInsensitive: false })).toEqual({ name: { contains: "john" } });
  });

  it("ignores IsNull and IsNotNull when set to false", () => {
    expect(buildPrismaWhere<User>({ email: { IsNotNull: false, IsNull: false } })).toEqual({});
  });

  it("combines operators on the same field", () => {
    expect(buildPrismaWhere<User>({ age: { GTE: 18, LTE: 65 } })).toEqual({ age: { gte: 18, lte: 65 } });
  });

  it("combines multiple fields", () => {
    expect(buildPrismaWhere<User>({ name: { Contains: "john" }, status: { Is: "active" } })).toEqual({
      name: { contains: "john", mode: "insensitive" },
      status: { equals: "active" },
    });
  });

  it("skips undefined conditions and blank values", () => {
    expect(buildPrismaWhere<User>({ name: undefined, status: { Is: undefined } })).toEqual({});
  });

  it("keeps falsy values such as 0 and false", () => {
    expect(buildPrismaWhere<User>({ age: { Is: 0 } })).toEqual({ age: { equals: 0 } });
  });

  it("maps OneOf to OR", () => {
    expect(buildPrismaWhere<User>({ age: { GTE: 18 }, OneOf: [{ status: { Is: "active" } }, { role: { Is: "admin" } }] })).toEqual({
      age: { gte: 18 },
      OR: [{ status: { equals: "active" } }, { role: { equals: "admin" } }],
    });
  });

  it("supports nested OneOf groups", () => {
    expect(buildPrismaWhere<User>({ OneOf: [{ name: { Is: "a" }, OneOf: [{ age: { Is: 1 } }, { age: { Is: 2 } }] }, { role: { Is: "admin" } }] })).toEqual({
      OR: [{ name: { equals: "a" }, OR: [{ age: { equals: 1 } }, { age: { equals: 2 } }] }, { role: { equals: "admin" } }],
    });
  });

  it("ignores an empty OneOf", () => {
    expect(buildPrismaWhere<User>({ OneOf: [] })).toEqual({});
  });
});

describe("buildPrismaOrder", () => {
  it("returns undefined when there is nothing to sort", () => {
    expect(buildPrismaOrder<User>(undefined)).toBeUndefined();
    expect(buildPrismaOrder<User>({})).toBeUndefined();
    expect(buildPrismaOrder<User>({ name: undefined })).toBeUndefined();
  });

  it("preserves sort priority as an array", () => {
    expect(buildPrismaOrder<User>({ age: "desc", name: "asc" })).toEqual([{ age: "desc" }, { name: "asc" }]);
  });
});

describe("buildPrismaSelect", () => {
  it("returns undefined when nothing is selected", () => {
    expect(buildPrismaSelect<User>(undefined)).toBeUndefined();
    expect(buildPrismaSelect<User>({})).toBeUndefined();
    expect(buildPrismaSelect<User>({ id: false })).toBeUndefined();
  });

  it("maps scalar fields", () => {
    expect(buildPrismaSelect<User>({ id: true, name: true })).toEqual({ id: true, name: true });
  });

  it("maps relations with nested filters", () => {
    expect(
      buildPrismaSelect<User>({
        id: true,
        posts: { limit: 5, order: { id: "desc" }, select: { title: true }, where: { published: { Is: true } } },
      }),
    ).toEqual({
      id: true,
      posts: { orderBy: [{ id: "desc" }], select: { title: true }, take: 5, where: { published: { equals: true } } },
    });
  });

  it("maps relations without nested filters to true", () => {
    expect(buildPrismaSelect<User>({ posts: {} })).toEqual({ posts: true });
    expect(buildPrismaSelect<User>({ posts: true })).toEqual({ posts: true });
  });
});

describe("buildPrismaFilters", () => {
  it("returns an empty object for empty filters", () => {
    expect(buildPrismaFilters<User>({})).toEqual({});
    expect(buildPrismaFilters<User>({ order: {}, select: {}, where: {} })).toEqual({});
  });

  it("maps every clause", () => {
    const filters: QueryFilters<User> = {
      limit: 10,
      offset: 20,
      order: { createdAt: "desc" },
      select: { id: true, name: true },
      where: { age: { GTE: 18 }, OneOf: [{ role: { Is: "admin" } }, { role: { Is: "moderator" } }] },
    };

    expect(buildPrismaFilters(filters)).toEqual({
      orderBy: [{ createdAt: "desc" }],
      select: { id: true, name: true },
      skip: 20,
      take: 10,
      where: { age: { gte: 18 }, OR: [{ role: { equals: "admin" } }, { role: { equals: "moderator" } }] },
    });
  });

  it("forwards options to nested selections", () => {
    const filters: QueryFilters<User> = { select: { posts: { where: { title: { Contains: "x" } } } } };

    expect(buildPrismaFilters(filters, { caseInsensitive: false })).toEqual({ select: { posts: { where: { title: { contains: "x" } } } } });
  });
});
