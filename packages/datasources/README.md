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

## Interface

Every datasource implements `IDatasource`:

```typescript
interface IDatasource<TSelect, TInsert extends object, TTransaction> {
  store(payload: TInsert): Promise<TSelect>;
  lookup(filters?: QueryFilters<TSelect>): Promise<TSelect | null>;
  list(filters?: QueryFilters<TSelect>): Promise<TSelect[]>;
  modify(filters: QueryFilters<TSelect>, payload: Partial<TInsert>): Promise<TSelect | null>;
  destroy(filters: QueryFilters<TSelect>): Promise<void>;
  withTransaction(transaction: TTransaction): IDatasource<TSelect, TInsert, TTransaction>;
}
```

`lookup` returns the first matching row or `null`. `list` honours `where`, `select`, `order`, `limit` and `offset`. `modify` updates every matching row and returns the first one. `modify` and `destroy` refuse an empty `where` clause, so a missing filter can never wipe a table: target every row explicitly with a condition such as `{ id: { IsNotNull: true } }`.

Transactions go through `ITransactor`:

```typescript
interface ITransactor<TTransaction> {
  transact<TResult>(callback: (transaction: TTransaction) => Promise<TResult>): Promise<TResult>;
}
```

## Drizzle

Row types are inferred from the table. Any PostgreSQL driver works (`postgres-js`, `node-postgres`, `pglite`, ...), with or without a typed schema.

```typescript
import { DrizzleDatasource, DrizzleTransactor } from "@ormx/datasources";
import { drizzle } from "drizzle-orm/postgres-js";
import { users, orders } from "./schema";

const db = drizzle(process.env.DATABASE_URL);

const usersDatasource = new DrizzleDatasource(db, users);
const ordersDatasource = new DrizzleDatasource(db, orders);

const user = await usersDatasource.store({ name: "John", email: "john@example.com" });
const found = await usersDatasource.lookup({ where: { id: { Is: user.id } } });
const active = await usersDatasource.list({ where: { status: { Is: "active" } }, order: { createdAt: "desc" }, limit: 20 });
const updated = await usersDatasource.modify({ where: { id: { Is: user.id } } }, { name: "Jane" });
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
import { PrismaDatasource, PrismaTransactor } from "@ormx/datasources";
import { PrismaClient } from "./generated/client";

const prisma = new PrismaClient({ adapter });

const usersDatasource = new PrismaDatasource(prisma, "user");
const ordersDatasource = new PrismaDatasource(prisma, "order");

const user = await usersDatasource.store({ name: "John", email: "john@example.com" });
const withOrders = await usersDatasource.list({
  select: { id: true, name: true, orders: { select: { total: true }, order: { createdAt: "desc" }, limit: 5 } },
});

const transactor = new PrismaTransactor(prisma);

await transactor.transact(async (tx) => {
  const user = await usersDatasource.withTransaction(tx).store({ name: "John" });
  await ordersDatasource.withTransaction(tx).store({ userId: user.id, total: 100 });
});
```

The model name is checked against the client, and `TSelect` and `TInsert` default to the model's row and create input types. Pass them explicitly when you select relations:

```typescript
type UserWithOrders = User & { orders: Order[] };
const datasource = new PrismaDatasource<PrismaClient, "user", UserWithOrders>(prisma, "user");
```

Text operators use `mode: "insensitive"`, which only PostgreSQL and MongoDB support. Pass `{ caseInsensitive: false }` as third constructor argument on other databases.

## Supabase

```typescript
import { SupabaseDatasource } from "@ormx/datasources";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const usersDatasource = new SupabaseDatasource<User>(supabase, "users");

const user = await usersDatasource.store({ name: "John", email: "john@example.com" });
const found = await usersDatasource.lookup({ where: { id: { Is: user.id } } });
```

Failed requests throw a `SupabaseDatasourceError` whose `cause` is the original PostgREST error.

The Supabase JS client has no transactions, so `withTransaction()` throws. For transactions, point `DrizzleDatasource` or `PrismaDatasource` at your Supabase Postgres connection string instead.

## License

MIT
