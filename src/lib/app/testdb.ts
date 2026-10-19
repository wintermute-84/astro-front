// Test-only: a D1-shaped wrapper over node:sqlite with migrations/ applied.
// Covers the subset the app uses: prepare().bind().first()/all()/run(), batch(), exec().
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';

export function testDb(): D1Database {
  const db = new DatabaseSync(':memory:');
  const dir = new URL('../../../migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(f, dir), 'utf8'));

  const stmt = (sql: string, args: unknown[] = []) => ({
    bind: (...a: unknown[]) => stmt(sql, a),
    first: async (col?: string) => {
      const row = db.prepare(sql).get(...(args as never[])) as Record<string, unknown> | undefined;
      return row === undefined ? null : col ? row[col] : { ...row };
    },
    all: async () => ({ results: (db.prepare(sql).all(...(args as never[])) as object[]).map((r) => ({ ...r })), success: true, meta: {} }),
    run: async () => {
      const r = db.prepare(sql).run(...(args as never[]));
      return { success: true, results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
    },
  });
  return {
    prepare: (sql: string) => stmt(sql),
    batch: async (stmts: { run(): Promise<unknown> }[]) => {
      db.exec('BEGIN');
      try {
        const out = [];
        for (const s of stmts) out.push(await s.run());
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    exec: async (sql: string) => db.exec(sql),
  } as unknown as D1Database;
}
