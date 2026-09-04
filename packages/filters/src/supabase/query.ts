/**
 * Options accepted by PostgREST modifiers that can target an embedded resource.
 */
export type SupabaseReference = { referencedTable?: string };

/**
 * Structural subset of `PostgrestFilterBuilder` used by the builders.
 * Any query returned by `supabase.from(table).select()`, `.update()` or `.delete()` satisfies it.
 */
export type SupabaseQuery = {
  filter(column: string, operator: string, value: unknown): SupabaseQuery;
  or(filters: string, options?: SupabaseReference): SupabaseQuery;
  order(column: string, options?: { ascending?: boolean } & SupabaseReference): SupabaseQuery;
  limit(count: number, options?: SupabaseReference): SupabaseQuery;
  range(from: number, to: number, options?: SupabaseReference): SupabaseQuery;
};

/**
 * Formats a value the way PostgREST expects it inside a filter.
 */
export function formatValue(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
}

/**
 * Quotes a value for use inside a PostgREST list or logical expression, where commas, parentheses, quotes and whitespace are reserved.
 */
export function quoteValue(value: unknown): string {
  const formatted = formatValue(value);

  return /[,()"\\\s]/.test(formatted) ? `"${formatted.replace(/[\\"]/g, "\\$&")}"` : formatted;
}

/**
 * Formats an array as a PostgREST list, deduplicated like `PostgrestFilterBuilder.in()` does.
 */
export function formatList(values: readonly unknown[]): string {
  return `(${Array.from(new Set(values)).map(quoteValue).join(",")})`;
}

/**
 * Prefixes a column with the path of an embedded resource, if any.
 */
export function qualify(path: string | undefined, column: string): string {
  return path ? `${path}.${column}` : column;
}

/**
 * Builds the modifier options targeting an embedded resource, if any.
 */
export function reference(path: string | undefined): SupabaseReference | undefined {
  return path ? { referencedTable: path } : undefined;
}
