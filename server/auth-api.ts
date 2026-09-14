import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
interface Statement { bind(...args: unknown[]): Statement; first<T = any>(): Promise<T | null>; run(): Promise<unknown> }
export interface AuthDB { prepare(sql: string): Statement; batch(statements: Statement[]): Promise<unknown> }
const COOKIE = '__Host-swf-session', AGE = 604800;
const random = () => bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
const digest = (s: string) => bytesToHex(sha256(utf8ToBytes(s)));
const hash = async (password: string, salt: string) => bytesToHex(await pbkdf2Async(sha256, password, salt, { c: 600000, dkLen: 32 }));
const same = (a: string, b: string) => { let diff = a.length ^ b.length; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ (b.charCodeAt(i) || 0); return diff === 0; };
const cookie = (value: string, age = AGE) => `${COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${age}`;
const json = (data: unknown, status = 200, session?: string) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...(session ? { 'set-cookie': session } : {}) } });
async function limited(db: AuthDB, key: string, max: number) {
  const now = Date.now();
  const row = await db.prepare('INSERT INTO auth_limits(key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires<? THEN 1 ELSE count+1 END, expires=CASE WHEN expires<? THEN excluded.expires ELSE expires END RETURNING count').bind(key, now + 900000, now, now).first<{ count: number }>();
  return !row || row.count > max;
}
// Auth owns identity only. It never imports local alpha balances or grants admin roles.
export async function authAPI(request: Request, env: { DB?: AuthDB }): Promise<Response | null> {
  const url = new URL(request.url), action = url.pathname.slice('/api/account/'.length);
  if (!url.pathname.startsWith('/api/account/')) return null;
  if (!['session', 'register', 'login', 'logout', 'recover', 'delete'].includes(action)) return json({ error: 'Not found.' }, 404);
  if (!env.DB) return json({ error: 'Online accounts are unavailable here. Open the published website to sign in.' }, 503);
  const db = env.DB;
  const token = request.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1) ?? '';
  const session = async () => /^[a-f0-9]{64}$/.test(token) ? db.prepare('SELECT a.id,a.username FROM game_sessions s JOIN game_accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.expires>?').bind(digest(token), Date.now()).first<{ id: string; username: string }>() : null;
  try {
    if (action === 'session' && request.method === 'GET') return json({ account: await session() });
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
    if (request.headers.get('origin') !== url.origin || request.headers.get('content-type')?.split(';')[0] !== 'application/json') return json({ error: 'Reload the game and try again.' }, 403);
    const reader = request.body?.getReader(); let size = 0, body = '';
    if (reader) { const decoder = new TextDecoder(); while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > 2048) { await reader.cancel(); return json({ error: 'Request too large.' }, 413); } body += decoder.decode(value, { stream: true }); } body += decoder.decode(); }
    let data: any; try { data = JSON.parse(body); } catch { return json({ error: 'Invalid request.' }, 400); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return json({ error: 'Invalid request.' }, 400);
    if (await limited(db, 'ip:' + digest(request.headers.get('cf-connecting-ip') ?? 'local'), 24)) return json({ error: 'Too many attempts. Try again in 15 minutes.' }, 429);
    if (action === 'logout') { await db.prepare('DELETE FROM game_sessions WHERE token_hash=?').bind(digest(token)).run(); return json({ account: null }, 200, cookie('', 0)); }
    if (action === 'delete') {
      const account = await session(); if (!account) return json({ error: 'Sign in first.' }, 401);
      const row = await db.prepare('SELECT password_hash,salt FROM game_accounts WHERE id=?').bind(account.id).first();
      if (typeof data.password !== 'string' || data.password.length > 128 || !same(await hash(data.password, row.salt), row.password_hash)) return json({ error: 'Incorrect password.' }, 401);
      await db.batch([db.prepare('DELETE FROM game_sessions WHERE account_id=?').bind(account.id), db.prepare('DELETE FROM game_accounts WHERE id=?').bind(account.id)]);
      return json({ account: null }, 200, cookie('', 0));
    }
    const username = typeof data.username === 'string' ? data.username.normalize('NFKC').trim().toLowerCase() : '', password = data.password;
    if (!/^[a-z0-9_]{3,24}$/.test(username) || typeof password !== 'string' || password.length < 12 || password.length > 128) return json({ error: 'Use a 3–24 character username (letters, numbers, underscore) and a 12–128 character password.' }, 400);
    if (await limited(db, 'name:' + digest(username), 8)) return json({ error: 'Too many attempts. Try again in 15 minutes.' }, 429);
    let account = await db.prepare('SELECT * FROM game_accounts WHERE username=?').bind(username).first(), recovery: string | undefined;
    if (action === 'register') {
      if (account || username === 'charizard495') return json({ error: 'That username is unavailable.' }, 409);
      const salt = random(); recovery = random(); const id = crypto.randomUUID(), hashed = await hash(password, salt);
      try { await db.prepare('INSERT INTO game_accounts(id,username,password_hash,salt,recovery_hash,created) VALUES (?,?,?,?,?,?)').bind(id, username, hashed, salt, digest(recovery), Date.now()).run(); }
      catch (e) { if (await db.prepare('SELECT id FROM game_accounts WHERE username=?').bind(username).first()) return json({ error: 'That username is unavailable.' }, 409); throw e; }
      account = { id, username };
    } else if (action === 'recover') {
      if (!account || typeof data.recovery !== 'string' || !same(digest(data.recovery.trim()), account.recovery_hash)) return json({ error: 'Username or recovery code is incorrect.' }, 401);
      const salt = random(); recovery = random();
      const reset = await db.prepare('UPDATE game_accounts SET password_hash=?,salt=?,recovery_hash=? WHERE id=? AND recovery_hash=? RETURNING id').bind(await hash(password, salt), salt, digest(recovery), account.id, account.recovery_hash).first();
      if (!reset) return json({ error: 'That recovery code has already been used.' }, 401);
      await db.prepare('DELETE FROM game_sessions WHERE account_id=?').bind(account.id).run();
    } else {
      const hashed = await hash(password, account?.salt ?? '0000000000000000000000000000000000000000000000000000000000000000');
      if (!account || !same(hashed, account.password_hash)) return json({ error: 'Username or password is incorrect.' }, 401);
    }
    const nextToken = random();
    await db.batch([db.prepare('DELETE FROM game_sessions WHERE expires<? OR token_hash=?').bind(Date.now(), digest(token)), db.prepare('INSERT INTO game_sessions(token_hash,account_id,expires) VALUES (?,?,?)').bind(digest(nextToken), account.id, Date.now() + AGE * 1000), db.prepare('DELETE FROM auth_limits WHERE expires<?').bind(Date.now())]);
    return json({ account: { id: account.id, username: account.username }, ...(recovery ? { recovery } : {}) }, 200, cookie(nextToken));
  } catch { return json({ error: 'Accounts are temporarily unavailable. Please try again shortly.' }, 503); }
}
