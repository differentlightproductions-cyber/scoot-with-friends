import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { ensureAccountEmailSchema } from '../server/account-schema';
import type { AuthDB } from '../server/auth-api';

test('email migration preserves old accounts and tolerates concurrent isolates', async () => {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../drizzle/0000_game_accounts.sql', import.meta.url), 'utf8'));
  sql.exec("INSERT INTO game_accounts VALUES ('old','rider','password-hash','salt','recovery-hash',123)");
  const wrap = (): AuthDB => ({ prepare(query) {
    let values: any[] = [];
    return { bind(...args) { values = args; return this; }, async first() { return sql.prepare(query).get(...values) ?? null; }, async run() { return sql.prepare(query).run(...values); } } as any;
  }, async batch() { return []; } });
  await Promise.all([ensureAccountEmailSchema(wrap()), ensureAccountEmailSchema(wrap())]);
  await ensureAccountEmailSchema(wrap());
  const row = sql.prepare('SELECT * FROM game_accounts').get()!;
  assert.equal(row.password_hash, 'password-hash');
  assert.equal(row.recovery_hash, 'recovery-hash');
  assert.equal(row.marketing_consent, 0);
  assert.equal(row.email, null);
  assert.equal(sql.prepare("SELECT count(*) AS n FROM pragma_index_list('game_accounts') WHERE name LIKE 'game_accounts_%'").get()!.n, 3);
  sql.close();
});
