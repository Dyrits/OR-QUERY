# ORMX

A monorepo for unified ORM utilities. Write your queries once with a common filter format, then run them on Prisma, Drizzle or Supabase.

## Packages

| Package | Version | Description | Docs |
|---------|---------|-------------|------|
| [@ormx/filters](./packages/filters) | 0.2.0 | Unified where, select, order and pagination across Prisma, Drizzle and Supabase | [README](./packages/filters/README.md) |
| [@ormx/datasources](./packages/datasources) | 0.2.0 | Unified CRUD datasource with transactions for Drizzle, Prisma and Supabase | [README](./packages/datasources/README.md) |

## Development

```bash
bun install
bun run build      # builds every package
bun run test       # builds, then runs the test suites (Drizzle and Prisma run against an embedded PGlite database)
bun run typecheck  # type-checks sources and tests
bun run check      # lints and formats with Biome
```

## License

MIT
