import { escapeLike, isBlank, isEnabled, operatorEntries, splitWhere } from "../shared";
import type { FieldOperators, Operator, ScalarKeys, Where } from "../types";

/**
 * Shape of Prisma's per-field filter operators.
 * `TValue` is the field type including `null` when the column is nullable, so `equals: null` is only allowed where Prisma accepts it.
 */
export type PrismaFieldOperators<TValue> = {
  equals?: TValue;
  not?: TValue;
  gt?: NonNullable<TValue>;
  gte?: NonNullable<TValue>;
  lt?: NonNullable<TValue>;
  lte?: NonNullable<TValue>;
  in?: NonNullable<TValue>[];
  notIn?: NonNullable<TValue>[];
  contains?: string;
  startsWith?: string;
  endsWith?: string;
  mode?: "default" | "insensitive";
};

/**
 * Prisma's `where` type for an entity.
 */
export type PrismaWhere<TEntity> = {
  [Key in ScalarKeys<TEntity>]?: PrismaFieldOperators<TEntity[Key]>;
} & {
  AND?: PrismaWhere<TEntity>[];
  OR?: PrismaWhere<TEntity>[];
  NOT?: PrismaWhere<TEntity>[];
};

export type PrismaOptions = {
  /**
   * Adds `mode: "insensitive"` to text operators so they behave like the Drizzle and Supabase builders.
   * Only supported by PostgreSQL and MongoDB, set to `false` on other databases.
   * @default true
   */
  caseInsensitive?: boolean;
};

type Fragment = Partial<PrismaFieldOperators<unknown>>;
type Builder = (value: unknown) => Fragment | undefined;

const comparison =
  (key: keyof Fragment): Builder =>
  (value) =>
    isBlank(value) ? undefined : { [key]: value };

const list =
  (key: keyof Fragment): Builder =>
  (value) =>
    Array.isArray(value) ? { [key]: value } : undefined;

const flag =
  (fragment: Fragment): Builder =>
  (value) =>
    isEnabled(value) ? fragment : undefined;

const text =
  (key: keyof Fragment): Builder =>
  (value) =>
    isBlank(value) ? undefined : { [key]: escapeLike(String(value)) };

const operators: Record<Operator, Builder> = {
  Contains: text("contains"),
  EndsWith: text("endsWith"),
  GT: comparison("gt"),
  GTE: comparison("gte"),
  In: list("in"),
  Is: comparison("equals"),
  IsNot: comparison("not"),
  IsNotNull: flag({ not: null }),
  IsNull: flag({ equals: null }),
  LT: comparison("lt"),
  LTE: comparison("lte"),
  NotIn: list("notIn"),
  StartsWith: text("startsWith"),
};

const textOperators = new Set<Operator>(["Contains", "StartsWith", "EndsWith"]);

function buildField(condition: FieldOperators<unknown>, options: PrismaOptions): { scalar: Fragment; text: Fragment } {
  const output = { scalar: {} as Fragment, text: {} as Fragment };

  for (const [operator, value] of operatorEntries(condition)) {
    const fragment = operators[operator](value);
    if (fragment) {
      Object.assign(textOperators.has(operator) ? output.text : output.scalar, fragment);
    }
  }

  if (Object.keys(output.text).length > 0 && options.caseInsensitive !== false) {
    output.text.mode = "insensitive";
  }

  return output;
}

/**
 * Converts a generic Where clause into Prisma-compatible format.
 * Prisma applies `mode` to every operator of a field, so case-insensitive text operators are emitted in a separate `AND` entry when the field also has exact comparisons.
 */
export function buildPrismaWhere<TEntity>(where?: Where<TEntity>, options: PrismaOptions = {}): PrismaWhere<TEntity> {
  const output: Record<string, unknown> = {};
  const and: Record<string, Fragment>[] = [];
  const { fields, groups } = splitWhere(where);

  for (const [field, condition] of fields) {
    const { scalar, text } = buildField(condition, options);
    const hasScalar = Object.keys(scalar).length > 0;
    const hasText = Object.keys(text).length > 0;

    if (hasScalar && hasText && text.mode) {
      output[field] = scalar;
      and.push({ [field]: text });
    } else if (hasScalar || hasText) {
      output[field] = { ...scalar, ...text };
    }
  }

  if (and.length > 0) {
    output.AND = and;
  }

  if (groups.length > 0) {
    output.OR = groups.map((group) => buildPrismaWhere(group, options));
  }

  return output as PrismaWhere<TEntity>;
}
