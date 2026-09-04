import { escapeLike, isBlank, isEnabled, operatorEntries, splitWhere } from "../shared.js";
import type { Operator, Where } from "../types.js";
import { formatList, formatValue, qualify, quoteValue, reference, type SupabaseQuery } from "./query.js";

/**
 * A PostgREST filter: `operator.value`, where `value` is `null` for `is` checks and a parenthesised list for `in` checks.
 */
type Operation = { operator: string; value: string | null; list?: boolean };
type Builder = (value: unknown) => Operation | undefined;

const comparison =
  (operator: string): Builder =>
  (value) =>
    isBlank(value) ? undefined : { operator, value: formatValue(value) };

const pattern =
  (wrap: (value: string) => string): Builder =>
  (value) =>
    isBlank(value) ? undefined : { operator: "ilike", value: wrap(escapeLike(formatValue(value))) };

const list =
  (operator: string): Builder =>
  (value) =>
    Array.isArray(value) ? { list: true, operator, value: formatList(value) } : undefined;

const flag =
  (operator: string): Builder =>
  (value) =>
    isEnabled(value) ? { operator, value: null } : undefined;

const operators: Record<Operator, Builder> = {
  Contains: pattern((value) => `%${value}%`),
  EndsWith: pattern((value) => `%${value}`),
  GT: comparison("gt"),
  GTE: comparison("gte"),
  In: list("in"),
  Is: comparison("eq"),
  IsNot: comparison("neq"),
  IsNotNull: flag("not.is"),
  IsNull: flag("is"),
  LT: comparison("lt"),
  LTE: comparison("lte"),
  NotIn: list("not.in"),
  StartsWith: pattern((value) => `${value}%`),
};

function toOperations<TEntity>(where: Where<TEntity> | undefined): { operations: [field: string, operation: Operation][]; groups: Where<TEntity>[] } {
  const { fields, groups } = splitWhere(where);
  const operations: [string, Operation][] = [];

  for (const [field, condition] of fields) {
    for (const [operator, value] of operatorEntries(condition)) {
      const operation = operators[operator](value);
      if (operation) {
        operations.push([field, operation]);
      }
    }
  }

  return { groups, operations };
}

function render(field: string, { list, operator, value }: Operation): string {
  if (value === null) {
    return `${field}.${operator}.null`;
  }

  return `${field}.${operator}.${list ? value : quoteValue(value)}`;
}

function renderGroups<TEntity>(groups: Where<TEntity>[]): string[] {
  return groups.map((group) => buildSupabaseWhereString(group)).filter((group): group is string => group !== undefined);
}

/**
 * Renders a where clause as a PostgREST logical expression, as expected by `.or()`.
 * Returns `undefined` when the clause is empty.
 */
export function buildSupabaseWhereString<TEntity>(where: Where<TEntity> | undefined): string | undefined {
  const { groups, operations } = toOperations(where);
  const conditions = operations.map(([field, operation]) => render(field, operation));

  const alternatives = renderGroups(groups);
  if (alternatives.length === 1) {
    conditions.push(alternatives[0]);
  } else if (alternatives.length > 1) {
    conditions.push(`or(${alternatives.join(",")})`);
  }

  if (conditions.length === 0) {
    return undefined;
  }

  return conditions.length === 1 ? conditions[0] : `and(${conditions.join(",")})`;
}

/**
 * Applies a generic Where clause to a Supabase query builder.
 * Pass `path` to filter rows of an embedded resource instead of the top-level table.
 */
export function buildSupabaseWhere<TQuery extends SupabaseQuery, TEntity>(query: TQuery, where?: Where<TEntity>, path?: string): TQuery {
  let output: SupabaseQuery = query;
  const { groups, operations } = toOperations(where);

  for (const [field, operation] of operations) {
    output = output.filter(qualify(path, field), operation.operator, operation.value);
  }

  const alternatives = renderGroups(groups);
  if (alternatives.length > 0) {
    output = output.or(alternatives.join(","), reference(path));
  }

  return output as TQuery;
}
