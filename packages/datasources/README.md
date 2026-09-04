# @ormx/datasources

Unified datasource abstraction for Drizzle, Prisma and Supabase with transaction support.

Provides a common CRUD interface over a table or model, driven by [`@ormx/filters`](../filters/README.md) query filters. Swap the ORM without touching the code that uses the datasource.

## Installation

```bash
npm install @ormx/datasources @ormx/filters
# or
bun add @ormx/datasources @ormx/filters
```

Then install the client you use: `drizzle-orm`, `@prisma/client` (6.2 or later) or `@supabase/supabase-js`.

Import from a sub-path so you only load the target you use. The root export pulls in all three, so it requires every optional peer to be installed:

```typescript
import { DrizzleDatasource, DrizzleTransactor } from "@ormx/datasources/drizzle";
import { PrismaDatasource, PrismaTransactor } from "@ormx/datasources/prisma";
import { SupabaseDatasource } from "@ormx/datasources/supabase";
```

## Interface

Every datasource implements `IDatasource`:

```typescript
interface IDatasource<TSelect, TInsert extends object, TTransaction> {
  store(payload: TInsert): Promise<TSelect>;
  lookup(filters?: QueryFilters<TSelect>): Promise<TSelect | null>;
  list(filters?: QueryFilters<TSelect>): Promise<TSelect[]>;
  modify(filters: WriteFilters<TSelect>, payload: Partial<TInsert>): Promise<TSelect[]>;
  destroy(filters: WriteFilters<TSelect>): Promise<void>;
  withTransaction(transaction: TTransaction): IDatasource<TSelect, TInsert, TTransaction>;
}
```

`lookup` returns the first matching row or `null`. `list` honours `where`, `select`, `order`, `limit` and `offset`.

Writes take `WriteFilters`, which is `where` plus a scalar-only `select`. Ordering, pagination and relation selections are left out because no target supports them on a write, so passing them is a compile error instead of a silently ignored option.

```typescript
type WriteFilters<TSelect> = { where?: Where<TSelect>; select?: ScalarSelect<TSelect> };
```

`modify` updates every matching row and returns all of them, so the caller can see how many were affected. Use `rows.length` to detect "no match" or "more than one match"; there is no implicit "first row" any more.

Both `modify` and `destroy` refuse filters that build no condition, so a missing filter can never wipe a table. The check runs on the condition the builders produce, not on the object you passed, which means `{ where: { id: { Is: undefined } } }` is rejected as well. To target every row, say so explicitly:

```typescript
await datasource.destroy({ where: { id: { IsNotNull: true } } });
```

Transactions go through `ITransactor`:

```typescript
interface ITransactor<TTransaction> {
  transact<TResult>(callback: (transaction: TTransaction) => Promise<TResult>): Promise<TResult>;
}
```

## Drizzle

Row types are inferred from the table. Any PostgreSQL driver works (`postgres-js`, `node-postgres`, `pglite`, ...), with or without a typed schema.

```typescript
import { DrizzleDatasource, DrizzleTransactor } from "@ormx/datasources/drizzle";
import { drizzle } from "drizzle-orm/postgres-js";
import { users, orders } from "./schema";

const db = drizzle(process.env.DATABASE_URL);

const usersDatasource = new DrizzleDatasource(db, users);
const ordersDatasource = new DrizzleDatasource(db, orders);

const user = await usersDatasource.store({ name: "John", email: "john@example.com" });
const found = await usersDatasource.lookup({ where: { id: { Is: user.id } } });
const active = await usersDatasource.list({ where: { status: { Is: "active" } }, order: { createdAt: "desc" }, limit: 20 });
const [updated] = await usersDatasource.modify({ where: { id: { Is: user.id } } }, { name: "Jane" });
await usersDatasource.destroy({ where: { id: { Is: user.id } } });

const transactor = new DrizzleTransactor(db);

await transactor.transact(async (tx) => {
  const user = await usersDatasource.withTransaction(tx).store({ name: "John" });
  await ordersDatasource.withTransaction(tx).store({ userId: user.id, total: 100 });
  // Throwing here rolls everything back.
});
```

Nested selections on relations are not supported by Drizzle's core query builder and throw.

## Prisma

Row types are inferred from the generated client. Requires Prisma 6.2 or later for `updateManyAndReturn`.

```typescript
import { PrismaDatasource, PrismaTransactor } from "@ormx/datasources/prisma";
import { PrismaClient } from "./generated/client";

const prisma = new PrismaClient({ adapter });

const usersDatasource = new PrismaDatasource(prisma, "user");
const ordersDatasource = new PrismaDatasource(prisma, "order");

const user = await usersDatasource.store({ name: "John", email: "john@example.com" });

const transactor = new PrismaTransactor(prisma);

await transactor.transact(async (tx) => {
  const user = await usersDatasource.withTransaction(tx).store({ name: "John" });
  await ordersDatasource.withTransaction(tx).store({ userId: user.id, total: 100 });
});
```

The model name is checked against the client, and the row and create-input types are taken from that model. To select relations, pass the row type you expect as third type argument:

```typescript
type UserWithOrders = User & { orders: Order[] };

const datasource = new PrismaDatasource<PrismaClient, "user", UserWithOrders>(prisma, "user");

const [user] = await datasource.list({
  select: { id: true, name: true, orders: { select: { total: true }, order: { createdAt: "desc" }, limit: 5 } },
});
```

Text operators use `mode: "insensitive"`, which only PostgreSQL and MongoDB support. Pass `{ caseInsensitive: false }` as third constructor argument on other databases.

## Supabase

```typescript
import { SupabaseDatasource } from "@ormx/datasources/supabase";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const usersDatasource = new SupabaseDatasource<User>(supabase, "users");

const user = await usersDatasource.store({ name: "John", email: "john@example.com" });
const found = await usersDatasource.lookup({ where: { id: { Is: user.id } } });
```

Failed requests throw a `SupabaseDatasourceError` whose `cause` is the original error, whether PostgREST returned a structured error or the request failed outright.

The Supabase JS client has no transactions, so `withTransaction()` throws. For transactions, point `DrizzleDatasource` or `PrismaDatasource` at your Supabase Postgres connection string instead.

## Target differences

`IDatasource` is the same shape everywhere, but two capabilities are not universal:

| Capability                       | Drizzle | Prisma | Supabase |
| -------------------------------- | ------- | ------ | -------- |
| `withTransaction`                | yes     | yes    | throws   |
| Relation selections in `list`    | throws  | yes    | yes      |

A function typed against `IDatasource` alone cannot see these, so keep the concrete type where you rely on transactions or nested selections.

## Testing

The Drizzle and Prisma datasources are tested against a real PostgreSQL through [PGlite](https://pglite.dev), including commit and rollback. Both run the same shared contract suite, so the implementations cannot drift. The Prisma client used by the tests is generated from `test/prisma/schema.prisma` by `bun run generate`, which the `test` and `typecheck` scripts run for you.

## License

MIT
