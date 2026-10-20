export function prepared(
  database: D1Database,
  sql: string,
  bindings: unknown[] = [],
): D1PreparedStatement {
  const query = database.prepare(sql);
  return bindings.length ? query.bind(...bindings) : query;
}
