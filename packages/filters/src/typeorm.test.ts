import { And, Equal, ILike, In, IsNull, LessThanOrEqual, MoreThanOrEqual, Not } from "typeorm";
import { describe, expect, it } from "vitest";
import { buildTypeOrmFilters, buildTypeOrmOrder, buildTypeOrmSelect, buildTypeOrmWhere } from "./typeorm/index.js";

type Post = { id: number; title: string };
type User = { id: number; name: string; email: string | null; age: number; status: string; posts: Post[] };

describe("buildTypeOrmWhere", () => {
  it("returns an empty object for empty input", () => {
    expect(buildTypeOrmWhere<User>()).toEqual({});
    expect(buildTypeOrmWhere<User>({})).toEqual({});
  });

  it("maps and combines field operators", () => {
    expect(buildTypeOrmWhere<User>({ age: { GTE: 18, LTE: 65 }, email: { IsNotNull: true }, status: { NotIn: ["banned"] } })).toEqual({
      age: And(MoreThanOrEqual(18), LessThanOrEqual(65)),
      email: Not(IsNull()),
      status: Not(In(["banned"])),
    });
  });

  it("uses case-insensitive patterns and escapes LIKE wildcards", () => {
    expect(buildTypeOrmWhere<User>({ name: { Contains: "50%_off" } })).toEqual({ name: ILike("%50\\%\\_off%") });
  });

  it("distributes nested OneOf groups into TypeORM OR alternatives", () => {
    expect(
      buildTypeOrmWhere<User>({
        age: { GTE: 18 },
        OneOf: [{ status: { Is: "active" } }, { name: { Is: "admin" }, OneOf: [{ age: { LTE: 30 } }, { age: { GTE: 60 } }] }],
      }),
    ).toEqual([
      { age: MoreThanOrEqual(18), status: Equal("active") },
      { age: And(MoreThanOrEqual(18), LessThanOrEqual(30)), name: Equal("admin") },
      { age: And(MoreThanOrEqual(18), MoreThanOrEqual(60)), name: Equal("admin") },
    ]);
  });

  it("skips blank values and disabled flags, and rejects unknown operators", () => {
    expect(buildTypeOrmWhere<User>({ email: { IsNull: false }, name: { Is: undefined } })).toEqual({});
    expect(() => buildTypeOrmWhere<User>({ name: { Like: "x" } as never })).toThrow('Unknown operator "Like"');
  });
});

describe("TypeORM query options", () => {
  it("maps selection and ordering", () => {
    expect(buildTypeOrmSelect<User>({ id: true, name: true, posts: { select: { title: true } } })).toEqual({ id: true, name: true, posts: { title: true } });
    expect(buildTypeOrmOrder<User>({ age: "desc", name: "asc" })).toEqual({ age: "desc", name: "asc" });
  });

  it("rejects relation-scoped clauses TypeORM cannot represent", () => {
    expect(() => buildTypeOrmSelect<User>({ posts: { limit: 2 } })).toThrow('scoped to relation "posts"');
  });

  it("maps every top-level clause", () => {
    expect(buildTypeOrmFilters<User>({ limit: 10, offset: 20, order: { age: "desc" }, select: { id: true }, where: { status: { Is: "active" } } })).toEqual({
      order: { age: "desc" },
      select: { id: true },
      skip: 20,
      take: 10,
      where: { status: Equal("active") },
    });
  });
});
