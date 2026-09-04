# @ormx/filters

Unified query filtering across Prisma, Drizzle, and Supabase.

Write your filters once using a common format, then convert them to the native format of your ORM or database client. Where, select, order and pagination are all covered.

## Installation

```bash
npm install @ormx/filters
# or
bun add @ormx/filters
```

Drizzle support needs `drizzle-orm` installed. Prisma and Supabase support have no extra dependency.

## Usage

### Define filters using the common format

```typescript
import type { QueryFilters } from "@ormx/filters";

type User = {
  id: number;
  name: string;
  email: string | null;
  age: number;
  status: string;
  createdAt: Date;
  posts: Post[];
};

const filters: QueryFilters<User> = {
  where: {
    name: { Contains: "john" },
    age: { GTE: 18, LTE: 65 },
    email: { IsNotNull: true },
    OneOf: [{ status: { Is: "active" } }, { status: { Is: "pending" } }],
  },
  select: {
    id: true,
    name: true,
    posts: { select: { title: true }, where: { published: { Is: true } }, order: { createdAt: "desc" }, limit: 5 },
  },
  order: { createdAt: "desc", name: "asc" },
  limit: 20,
  offset: 40,
};
```

### Prisma

```typescript
import { buildPrismaFilters } from "@ormx/filters/prisma";

const users = await prisma.user.findMany(buildPrismaFilters(filters));
```

The result only contains the clauses you set, so it can be passed to `findMany`, `findFirst`, `count`, or nested relation queries as is:

```typescript
{
  where: { name: { contains: "john", mode: "insensitive" }, age: { gte: 18, lte: 65 }, email: { not: null }, OR: [...] },
  select: { id: true, name: true, posts: { select: { title: true }, where: {...}, orderBy: [{ createdAt: "desc" }], take: 5 } },
  orderBy: [{ createdAt: "desc" }, { name: "asc" }],
  take: 20,
  skip: 40,
}
```

Text operators add `mode: "insensitive"` so they behave like Drizzle and Supabase. This is only supported by PostgreSQL and MongoDB. Pass `{ caseInsensitive: false }` on other databases:

```typescript
buildPrismaFilters(filters, { caseInsensitive: false });
```

Individual builders are also available: `buildPrismaWhere`, `buildPrismaSelect`, `buildPrismaOrder`.

### Drizzle

```typescript
import { buildDrizzleFilters } from "@ormx/filters/drizzle";
import { users } from "./schema";

const { where, select, orderBy, limit, offset } = buildDrizzleFilters(filters, users);

const rows = await db
  .select(select ?? getTableColumns(users))
  .from(users)
  .where(where)
  .orderBy(...orderBy)
  .limit(limit ?? 100);
```

The second argument tells the builder where to find columns. It accepts a Drizzle table, a record of columns, or a resolver function `(field) => column`. Unknown fields throw instead of producing broken SQL.

`where` is `undefined` when there is no condition, `select` is `undefined` when every column is selected, and `orderBy` is an empty array when there is no sort. Nested selections on relations are not supported by Drizzle's core query builder and throw.

Individual builders are also available: `buildDrizzleWhere`, `buildDrizzleSelect`, `buildDrizzleOrder`.

### Supabase

```typescript
import { buildSupabaseFilters, buildSupabaseSelect } from "@ormx/filters/supabase";

const query = supabase.from("users").select(buildSupabaseSelect(filters.select));
const { data: users } = await buildSupabaseFilters(query, filters);
```

`buildSupabaseSelect` produces the PostgREST columns string, including embedded resources (`"id,name,posts(title)"`). `buildSupabaseFilters` then applies where, order and pagination to the table and to each embedded resource.

PostgREST needs an upper bound for pagination, so `offset` can only be used together with `limit`.

Individual builders are also available: `buildSupabaseWhere`, `buildSupabaseOrder`, `buildSupabaseRange`, and `buildSupabaseWhereString` for raw `.or()` expressions.

## Operators

| Operator     | Description                             | Prisma                          | Drizzle      | Supabase      |
| ------------ | --------------------------------------- | ------------------------------- | ------------ | ------------- |
| `Is`         | Equals                                  | `equals`                        | `eq`         | `eq`          |
| `IsNot`      | Not equals                              | `not`                           | `ne`         | `neq`         |
| `GT`         | Greater than                            | `gt`                            | `gt`         | `gt`          |
| `GTE`        | Greater than or equal                   | `gte`                           | `gte`        | `gte`         |
| `LT`         | Less than                               | `lt`                            | `lt`         | `lt`          |
| `LTE`        | Less than or equal                      | `lte`                           | `lte`        | `lte`         |
| `In`         | Value in array                          | `in`                            | `inArray`    | `in`          |
| `NotIn`      | Value not in array                      | `notIn`                         | `notInArray` | `not.in`      |
| `Contains`   | Contains substring (case-insensitive)   | `contains`, `mode: insensitive` | `ilike`      | `ilike`       |
| `StartsWith` | Starts with (case-insensitive)          | `startsWith`, `mode: insensitive` | `ilike`    | `ilike`       |
| `EndsWith`   | Ends with (case-insensitive)            | `endsWith`, `mode: insensitive` | `ilike`      | `ilike`       |
| `IsNull`     | Is null (when `true`)                   | `equals: null`                  | `isNull`     | `is.null`     |
| `IsNotNull`  | Is not null (when `true`)               | `not: null`                     | `isNotNull`  | `not.is.null` |

Operators on the same field and across fields are combined with AND. `undefined` and `null` values are skipped, so optional filters can be passed straight through. LIKE wildcards in text operators are escaped, so user input is always matched literally.

## OR conditions

Use `OneOf` to create OR conditions. Groups can contain several conditions and nest further `OneOf` clauses:

```typescript
const filters: QueryFilters<User> = {
  where: {
    age: { GTE: 18 },
    OneOf: [{ status: { Is: "active" } }, { role: { Is: "admin" }, email: { IsNotNull: true } }],
  },
};
```

This translates to `age >= 18 AND (status = 'active' OR (role = 'admin' AND email IS NOT NULL))`.

## Imports

The root export includes every builder. Import from a sub-path to keep the other ORMs out of your bundle, and to avoid loading `drizzle-orm` when it is not installed:

```typescript
import { buildPrismaFilters } from "@ormx/filters/prisma";
import { buildDrizzleFilters } from "@ormx/filters/drizzle";
import { buildSupabaseFilters } from "@ormx/filters/supabase";
```

## License

MIT
