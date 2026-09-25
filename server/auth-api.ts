import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { emailReady, sendAccountEmail, type EmailEnv } from './email';
import { ensureAccountEmailSchema } from './account-schema';
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
// Auth owns identity. It never grants admin roles or paid entitlements. The
// save slot below is a copy of the player's own progress for moving between
// devices; the client validates everything it loads from it, and anything paid
// for with real money must live in its own server-authoritative table.
const SAVE_LIMIT = 65536;
const validEmail = (value: unknown): value is string => typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export async function authAPI(request: Request, env: { DB?: AuthDB } & EmailEnv, ctx?: { waitUntil(promise: Promise<unknown>): void }): Promise<Response | null> {
  const url = new URL(request.url), action = url.pathname.slice('/api/account/'.length);
  if (!url.pathname.startsWith('/api/account/')) return null;
  if (!['session', 'register', 'login', 'logout', 'recover', 'delete', 'save', 'email-request', 'email-verify', 'email-reset-request', 'email-reset', 'email-consent'].includes(action)) return json({ error: 'Not found.' }, 404);
  if (!env.DB) return json({ error: 'Online accounts are unavailable here. Open the published website to sign in.' }, 503);
  const db = env.DB;
  const token = request.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1) ?? '';
  const session = async () => /^[a-f0-9]{64}$/.test(token) ? db.prepare('SELECT a.id,a.username,a.email,a.pending_email,a.marketing_consent FROM game_sessions s JOIN game_accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.expires>?').bind(digest(token), Date.now()).first<{ id: string; username: string; email: string | null; pending_email: string | null; marketing_consent: number }>() : null;
  const publicAccount = (a: { id: string; username: string; email?: string | null; pending_email?: string | null; marketing_consent?: number }) => ({ id: a.id, username: a.username, email: a.email ?? null, pendingEmail: a.pending_email ?? null, marketingConsent: !!a.marketing_consent });
  try {
    await ensureAccountEmailSchema(db);
    if (action === 'session' && request.method === 'GET') { const a = await session(); return json({ account: a ? publicAccount(a) : null, emailReady: emailReady(env) }); }
    if (action === 'save' && request.method === 'GET') {
      const account = await session(); if (!account) return json({ error: 'Sign in first.' }, 401);
      const row = await db.prepare('SELECT data,revision,updated FROM game_saves WHERE account_id=?').bind(account.id).first<{ data: string; revision: number; updated: number }>();
      return json({ save: row ? { data: JSON.parse(row.data), revision: row.revision, updated: row.updated } : null });
    }
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
    if (request.headers.get('origin') !== url.origin || request.headers.get('content-type')?.split(';')[0] !== 'application/json') return json({ error: 'Reload the game and try again.' }, 403);
    const reader = request.body?.getReader(), max = action === 'save' ? SAVE_LIMIT + 256 : 2048; let size = 0, body = '';
    if (reader) { const decoder = new TextDecoder(); while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > max) { await reader.cancel(); return json({ error: 'Request too large.' }, 413); } body += decoder.decode(value, { stream: true }); } body += decoder.decode(); }
    let data: any; try { data = JSON.parse(body); } catch { return json({ error: 'Invalid request.' }, 400); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return json({ error: 'Invalid request.' }, 400);
    if (action === 'save') {
      // Saving is frequent, so it has its own per-account budget instead of the sign-in limit.
      const account = await session(); if (!account) return json({ error: 'Sign in first.' }, 401);
      if (await limited(db, 'save:' + account.id, 120)) return json({ error: 'Saving too often. Try again shortly.' }, 429);
      const text = JSON.stringify(data.data), base = data.base;
      if (!data.data || typeof data.data !== 'object' || Array.isArray(data.data) || text.length > SAVE_LIMIT || !Number.isSafeInteger(base) || base < 0) return json({ error: 'Invalid save.' }, 400);
      const now = Date.now();
      // Only replaces the copy this device last saw (or any copy when forced), so
      // two devices can never silently overwrite each other's progress.
      const saved = await db.prepare('INSERT INTO game_saves(account_id,data,revision,updated) VALUES (?,?,1,?) ON CONFLICT(account_id) DO UPDATE SET data=excluded.data,revision=game_saves.revision+1,updated=excluded.updated WHERE game_saves.revision=? OR ?=1 RETURNING revision,updated').bind(account.id, text, now, base, data.force === true ? 1 : 0).first<{ revision: number; updated: number }>();
      if (saved) return json({ revision: saved.revision, updated: saved.updated });
      const row = await db.prepare('SELECT data,revision,updated FROM game_saves WHERE account_id=?').bind(account.id).first<{ data: string; revision: number; updated: number }>();
      return json({ error: 'Your progress changed on another device.', save: row ? { data: JSON.parse(row.data), revision: row.revision, updated: row.updated } : null }, 409);
    }
    if (await limited(db, 'ip:' + digest(request.headers.get('cf-connecting-ip') ?? 'local'), 24)) return json({ error: 'Too many attempts. Try again in 15 minutes.' }, 429);
    if (action === 'email-reset-request') {
      if (!emailReady(env)) return json({ error: 'Email recovery is not available yet. Use your recovery code.' }, 503);
      const email = validEmail(data.email) ? data.email.trim().toLowerCase() : '';
      if (!email) return json({ error: 'Enter a valid email address.' }, 400);
      if (await limited(db, 'reset:' + digest(email), 3)) return json({ ok: true });
      const a = await db.prepare('SELECT id,email FROM game_accounts WHERE email=?').bind(email).first<{ id: string; email: string }>();
      if (a) {
        const secret = random(), expires = Date.now() + 1800000;
        const deliver = (async () => {
          let sent = false; try { sent = await sendAccountEmail(env, a.email, 'Reset your Scoot with Friends password', 'reset', secret); } catch { /* keep account existence private */ }
          if (sent) await db.prepare('UPDATE game_accounts SET reset_token_hash=?,reset_token_expires=? WHERE id=? AND email=?').bind(digest(secret), expires, a.id, email).run();
        })();
        if (ctx?.waitUntil) ctx.waitUntil(deliver.catch(() => {})); else await deliver;
      }
      return json({ ok: true });
    }
    if (action === 'email-reset') {
      if (typeof data.token !== 'string' || !/^[a-f0-9]{64}$/.test(data.token) || typeof data.password !== 'string' || data.password.length < 12 || data.password.length > 128) return json({ error: 'Invalid or expired reset link.' }, 400);
      const now = Date.now(), oldHash = digest(data.token);
      const a = await db.prepare('SELECT id,username,email,pending_email,marketing_consent FROM game_accounts WHERE reset_token_hash=? AND reset_token_expires>?').bind(oldHash, now).first<{ id: string; username: string; email: string | null; pending_email: string | null; marketing_consent: number }>();
      if (!a) return json({ error: 'Invalid or expired reset link.' }, 401);
      const salt = random(), nextRecovery = random(), nextToken = random(), nextHash = digest(nextToken);
      await db.batch([
        db.prepare('UPDATE game_accounts SET password_hash=?,salt=?,recovery_hash=?,reset_token_hash=NULL,reset_token_expires=NULL WHERE id=? AND reset_token_hash=? AND reset_token_expires>?').bind(await hash(data.password, salt), salt, digest(nextRecovery), a.id, oldHash, now),
        db.prepare('INSERT INTO game_sessions(token_hash,account_id,expires) SELECT ?,?,? WHERE changes()=1').bind(nextHash, a.id, now + AGE * 1000),
        db.prepare('DELETE FROM game_sessions WHERE account_id=? AND token_hash<>? AND EXISTS (SELECT 1 FROM game_sessions WHERE token_hash=? AND account_id=?)').bind(a.id, nextHash, nextHash, a.id)
      ]);
      if (!await db.prepare('SELECT 1 FROM game_sessions WHERE token_hash=? AND account_id=?').bind(nextHash, a.id).first()) return json({ error: 'Invalid or expired reset link.' }, 401);
      return json({ account: publicAccount(a), recovery: nextRecovery }, 200, cookie(nextToken));
    }
    if (action === 'email-verify') {
      if (typeof data.token !== 'string' || !/^[a-f0-9]{64}$/.test(data.token)) return json({ error: 'Invalid or expired verification link.' }, 400);
      const a = await session();
      if (!a) return json({ error: 'Sign in to verify your email.' }, 401);
      const verified = await db.prepare('UPDATE game_accounts SET email=pending_email,pending_email=NULL,email_token_hash=NULL,email_token_expires=NULL,reset_token_hash=NULL,reset_token_expires=NULL WHERE id=? AND email_token_hash=? AND email_token_expires>? AND pending_email IS NOT NULL AND NOT EXISTS (SELECT 1 FROM game_accounts other WHERE other.email=game_accounts.pending_email AND other.id<>game_accounts.id) RETURNING id').bind(a.id, digest(data.token), Date.now()).first();
      if (!verified) return json({ error: 'Invalid, expired, or already used verification link.' }, 401);
      return json({ account: publicAccount((await session())!) });
    }
    if (action === 'email-request') {
      const a = await session();
      if (!a) return json({ error: 'Sign in first.' }, 401);
      if (!emailReady(env)) return json({ error: 'Email verification is not available yet. Your recovery code still works.' }, 503);
      if (!validEmail(data.email) || typeof data.password !== 'string' || data.password.length > 128) return json({ error: 'Enter a valid email and current password.' }, 400);
      const current = await db.prepare('SELECT password_hash,salt FROM game_accounts WHERE id=?').bind(a.id).first<{ password_hash: string; salt: string }>();
      if (!current || !same(await hash(data.password, current.salt), current.password_hash)) return json({ error: 'Incorrect password.' }, 401);
      const email = data.email.trim().toLowerCase();
      if (await db.prepare('SELECT id FROM game_accounts WHERE email=? AND id<>?').bind(email, a.id).first()) return json({ error: 'That email is unavailable.' }, 409);
      if (await limited(db, 'verify:' + a.id, 3)) return json({ error: 'Too many attempts. Try again in 15 minutes.' }, 429);
      const secret = random();
      await db.prepare('UPDATE game_accounts SET pending_email=?,email_token_hash=?,email_token_expires=? WHERE id=?').bind(email, digest(secret), Date.now() + 1800000, a.id).run();
      let sent = false; try { sent = await sendAccountEmail(env, email, 'Verify your Scoot with Friends email', 'verify', secret); } catch { /* provider unavailable */ }
      if (!sent) return json({ error: 'Could not send verification email. Please try again later.' }, 503);
      return json({ account: publicAccount((await session())!), sent: true });
    }
    if (action === 'email-consent') {
      const a = await session(); if (!a) return json({ error: 'Sign in first.' }, 401);
      if (typeof data.consent !== 'boolean') return json({ error: 'Invalid choice.' }, 400);
      await db.prepare('UPDATE game_accounts SET marketing_consent=?,marketing_consented_at=? WHERE id=?').bind(data.consent ? 1 : 0, data.consent ? Date.now() : null, a.id).run();
      return json({ account: publicAccount((await session())!) });
    }
    if (action === 'logout') { await db.prepare('DELETE FROM game_sessions WHERE token_hash=?').bind(digest(token)).run(); return json({ account: null }, 200, cookie('', 0)); }
    if (action === 'delete') {
      const account = await session(); if (!account) return json({ error: 'Sign in first.' }, 401);
      const row = await db.prepare('SELECT password_hash,salt FROM game_accounts WHERE id=?').bind(account.id).first();
      if (typeof data.password !== 'string' || data.password.length > 128 || !same(await hash(data.password, row.salt), row.password_hash)) return json({ error: 'Incorrect password.' }, 401);
      await db.batch([db.prepare('DELETE FROM game_sessions WHERE account_id=?').bind(account.id), db.prepare('DELETE FROM game_saves WHERE account_id=?').bind(account.id), db.prepare('DELETE FROM game_accounts WHERE id=?').bind(account.id)]);
      return json({ account: null }, 200, cookie('', 0));
    }
    const username = typeof data.username === 'string' ? data.username.normalize('NFKC').trim().toLowerCase() : '', password = data.password;
    if (!/^[a-z0-9_]{3,24}$/.test(username) || typeof password !== 'string' || password.length < 12 || password.length > 128) return json({ error: 'Use a 3–24 character username (letters, numbers, underscore) and a 12–128 character password.' }, 400);
    if (await limited(db, 'name:' + digest(username), 8)) return json({ error: 'Too many attempts. Try again in 15 minutes.' }, 429);
    let account = await db.prepare('SELECT * FROM game_accounts WHERE username=?').bind(username).first(), recovery: string | undefined;
    if (action === 'register') {
      if (account || username === 'charizard495') return json({ error: 'That username is unavailable.' }, 409);
      const salt = random(); recovery = random(); const id = crypto.randomUUID(), hashed = await hash(password, salt);
      if (!validEmail(data.email) || typeof data.marketingConsent !== 'boolean') return json({ error: 'Enter a valid email and choose your email preference.' }, 400);
      const email = data.email.trim().toLowerCase();
      try { await db.prepare('INSERT INTO game_accounts(id,username,password_hash,salt,recovery_hash,created,marketing_consent,marketing_consented_at) VALUES (?,?,?,?,?,?,?,?)').bind(id, username, hashed, salt, digest(recovery), Date.now(), data.marketingConsent ? 1 : 0, data.marketingConsent ? Date.now() : null).run(); }
      catch (e) { if (await db.prepare('SELECT id FROM game_accounts WHERE username=?').bind(username).first()) return json({ error: 'That username is unavailable.' }, 409); throw e; }
      account = { id, username, email: null, pending_email: null, marketing_consent: data.marketingConsent ? 1 : 0 };
      await db.prepare('UPDATE game_accounts SET pending_email=? WHERE id=?').bind(email, id).run();
      account.pending_email = email;
      if (emailReady(env)) {
        const secret = random();
        await db.prepare('UPDATE game_accounts SET pending_email=?,email_token_hash=?,email_token_expires=? WHERE id=?').bind(email, digest(secret), Date.now() + 1800000, id).run();
        try { await sendAccountEmail(env, email, 'Verify your Scoot with Friends email', 'verify', secret); } catch { /* account and recovery code still work */ }
      }
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
    const complete = await db.prepare('SELECT id,username,email,pending_email,marketing_consent FROM game_accounts WHERE id=?').bind(account.id).first();
    return json({ account: publicAccount(complete), ...(recovery ? { recovery } : {}), emailReady: emailReady(env) }, 200, cookie(nextToken));
  } catch { return json({ error: 'Accounts are temporarily unavailable. Please try again shortly.' }, 503); }
}
