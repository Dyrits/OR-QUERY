import type { FieldOperators, Operator, QueryFilters, Where } from "./types";

/**
 * Every supported operator, used to reject unknown ones coming from untrusted input.
 */
export const OPERATORS: readonly Operator[] = ["Is", "IsNot", "GT", "GTE", "LT", "LTE", "In", "NotIn", "Contains", "StartsWith", "EndsWith", "IsNull", "IsNotNull"];

const known = new Set<string>(OPERATORS);

export type FieldCondition = [field: string, condition: FieldOperators<unknown>];

/**
 * Splits a where clause into its field conditions and its OneOf groups, skipping empty entries.
 */
export function splitWhere<TEntity>(where: Where<TEntity> | undefined): { fields: FieldCondition[]; groups: Where<TEntity>[] } {
  if (!where) {
    return { fields: [], groups: [] };
  }

  const { OneOf, ...rest } = where;
  const fields = Object.entries(rest).filter((entry): entry is FieldCondition => Boolean(entry[1]));

  return { fields, groups: OneOf ?? [] };
}

/**
 * Lists the operators of a field condition with their values.
 * Throws on unknown operators, so a typo or a bad payload cannot silently drop a condition.
 */
export function operatorEntries(condition: FieldOperators<unknown>): [Operator, unknown][] {
  const entries = Object.entries(condition);

  for (const [operator] of entries) {
    if (!known.has(operator)) {
      throw new Error(`[@ormx/filters] Unknown operator "${operator}".`);
    }
  }

  return entries as [Operator, unknown][];
}

/**
 * Whether a filter value should be ignored.
 */
export function isBlank(value: unknown): value is null | undefined {
  return value === undefined || value === null;
}

/**
 * Whether a flag operator such as `IsNull` is enabled. Anything but `false` and `undefined` enables it, so JSON payloads using `null` keep working.
 */
export function isEnabled(value: unknown): boolean {
  return value !== false && value !== undefined;
}

/**
 * Whether a select entry is a nested query on a relation.
 */
export function isNestedSelect(value: unknown): value is QueryFilters<unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Escapes LIKE wildcards so that user input is matched literally.
 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}
