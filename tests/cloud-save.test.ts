import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {authAPI, type AuthDB} from '../server/auth-api';
import {reconcile, saveSummary} from '../src/data/cloud';

const database = () => {
  const sql = new DatabaseSync(':memory:');
  for (const file of ['0000_game_accounts.sql', '0001_game_saves.sql', '0002_account_email.sql']) sql.exec(readFileSync(new URL('../drizzle/' + file, import.meta.url), 'utf8').replaceAll('--> statement-breakpoint',''));
  const db: AuthDB = {
    prepare(query) { let values: any[] = []; return { bind(...args: any[]) { values = args; return this; }, async first() { return sql.prepare(query).get(...values) ?? null; }, async run() { return sql.prepare(query).run(...values); } } as any; },
    async batch(statements) { sql.exec('BEGIN'); try { const results = []; for (const s of statements) results.push(await s.run()); sql.exec('COMMIT'); return results; } catch (e) { sql.exec('ROLLBACK'); throw e; } },
  };
  return { sql, db };
};

test('cloud save: signed-in only, revisioned, no silent overwrite across devices, removed with the account', async () => {
  const { sql, db } = database(), origin = 'https://game.example';
  let cookie = '';
  const call = async (action: string, data?: unknown) => authAPI(new Request(origin + '/api/account/' + action, { method: data ? 'POST' : 'GET', headers: { origin, 'content-type': 'application/json', cookie }, ...(data ? { body: JSON.stringify(data) } : {}) }), { DB: db }) as Promise<Response>;
  assert.equal((await call('save')).status, 401, 'no save without a session');
  const res = await call('register', { username: 'save_rider', password: 'test-only-strong-password', email: 'save@example.com', marketingConsent: false });
  cookie = res.headers.get('set-cookie')!.split(';')[0];
  assert.deepEqual(await (await call('save')).json(), { save: null });
  const profile = { version: 3, wallet: { credit: 420 }, progress: { xp: 900 } };
  // Device A saves first (base 0), then again on top of its own copy.
  let r = await call('save', { data: profile, base: 0 });
  assert.equal(r.status, 200); const first = await r.json(); assert.equal(first.revision, 1);
  r = await call('save', { data: { ...profile, wallet: { credit: 500 } }, base: 1 });
  assert.equal((await r.json()).revision, 2);
  // Device B still holds revision 1: refused, and handed the newer copy.
  r = await call('save', { data: { ...profile, wallet: { credit: 1 } }, base: 1 });
  assert.equal(r.status, 409); const conflict = await r.json();
  assert.equal(conflict.save.revision, 2); assert.equal(conflict.save.data.wallet.credit, 500);
  // Choosing to keep device B's progress overwrites on purpose.
  r = await call('save', { data: { ...profile, wallet: { credit: 1 } }, base: 1, force: true });
  assert.equal((await r.json()).revision, 3);
  assert.equal((await (await call('save')).json()).save.data.wallet.credit, 1);
  // Bad input.
  assert.equal((await call('save', { data: [1, 2], base: 3 })).status, 400);
  assert.equal((await call('save', { data: profile, base: -1 })).status, 400);
  assert.equal((await call('save', { data: { blob: 'x'.repeat(70000) }, base: 3 })).status, 413);
  // Deleting the account deletes its save.
  assert.equal((await call('delete', { password: 'test-only-strong-password' })).status, 200);
  assert.equal((sql.prepare('SELECT COUNT(*) AS n FROM game_saves').get() as any).n, 0);
});

test('cloud save: reconciling a device with the account copy', () => {
  const local = { text: '{"a":1}', dirty: false };
  // Nothing in the cloud yet: upload this device.
  assert.equal(reconcile({ accountId: 'x', local, synced: null, server: null }), 'push');
  // Same account, server moved on, no local changes: take the server copy.
  assert.equal(reconcile({ accountId: 'x', local, synced: { accountId: 'x', revision: 2 }, server: { revision: 3 } }), 'pull');
  // Same revision, local changes since: upload them.
  assert.equal(reconcile({ accountId: 'x', local: { ...local, dirty: true }, synced: { accountId: 'x', revision: 3 }, server: { revision: 3 } }), 'push');
  assert.equal(reconcile({ accountId: 'x', local, synced: { accountId: 'x', revision: 3 }, server: { revision: 3 } }), 'none');
  // Both changed, or this device last synced another account: the player chooses.
  assert.equal(reconcile({ accountId: 'x', local: { ...local, dirty: true }, synced: { accountId: 'x', revision: 2 }, server: { revision: 3 } }), 'ask');
  assert.equal(reconcile({ accountId: 'x', local, synced: { accountId: 'y', revision: 9 }, server: { revision: 1 } }), 'ask');
  // A fresh device (never synced) with an existing cloud save asks too.
  assert.equal(reconcile({ accountId: 'x', local, synced: null, server: { revision: 4 } }), 'ask');
  // Summaries for the choice.
  assert.deepEqual(saveSummary({ wallet: { credit: 1234, owned: ['a', 'b'] }, progress: { xp: 0 } }), { level: 1, credit: 1234, parts: 2 });
  assert.deepEqual(saveSummary(null), { level: 1, credit: 0, parts: 0 });
});
