import type { AuthDB } from './auth-api';

const ready = new WeakMap<AuthDB, Promise<void>>();
// Sites does not apply the packaged Drizzle journal. Add only missing fields;
// existing account credentials, sessions and saves remain untouched.
export function ensureAccountEmailSchema(db: AuthDB): Promise<void> {
  const existing = ready.get(db);
  if (existing) return existing;
  const migration = (async () => {
    const columns = {
      email: 'TEXT', pending_email: 'TEXT', email_token_hash: 'TEXT',
      email_token_expires: 'INTEGER', reset_token_hash: 'TEXT', reset_token_expires: 'INTEGER',
      marketing_consent: 'INTEGER NOT NULL DEFAULT 0', marketing_consented_at: 'INTEGER',
    };
    for (const [name, type] of Object.entries(columns)) {
      const present = () => db.prepare("SELECT 1 FROM pragma_table_info('game_accounts') WHERE name=?").bind(name).first();
      if (await present()) continue;
      try { await db.prepare(`ALTER TABLE game_accounts ADD COLUMN ${name} ${type}`).run(); }
      catch (error) { if (!await present()) throw error; } // Another isolate may have added it.
    }
    for (const [name, column] of [['verified_email', 'email'], ['email_token', 'email_token_hash'], ['reset_token', 'reset_token_hash']])
      await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS game_accounts_${name} ON game_accounts(${column}) WHERE ${column} IS NOT NULL`).run();
  })();
  ready.set(db, migration);
  void migration.catch(() => ready.delete(db));
  return migration;
}
