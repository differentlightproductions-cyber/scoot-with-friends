import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';

const origin = 'http://127.0.0.1:5183/';
const artifacts = 'artifacts/network';
mkdirSync(artifacts, { recursive: true });
const evidence = { origin, result: 'INCOMPLETE', steps: [], clients: [], errors: [] };
let phase = 'startup';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
let hostCode = '', roomCode = '';

async function client(name) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const info = { name, socialConnected: false, roomConnected: false, remoteRiders: 0, pageErrors: [] };
  evidence.clients.push(info);
  page.on('pageerror', e => info.pageErrors.push(e.message));
  page.on('dialog', async dialog => {
    if (dialog.type() !== 'prompt') { await dialog.dismiss(); return; }
    const question = dialog.message();
    if (question.includes('guest display name')) await dialog.accept(name);
    else if (question.includes('Friend code')) await dialog.accept(hostCode);
    else if (question.includes('Paste invite link or room code')) await dialog.accept(roomCode);
    else await dialog.dismiss();
  });
  await page.goto(origin);
  await page.waitForFunction(() => window.__LAZER?.phone?.apps?.some(a => a.id === 'friends'));
  await page.evaluate(() => { const g = window.__LAZER; g.startSession('outdoor', true); g.hud.start(); });
  await page.waitForFunction(() => window.__LAZER.friends.status === 'Connected', null, { timeout: 30000 });
  assert((await page.evaluate(() => window.__LAZER.network.endpoint)).endsWith(':8788'));
  info.socialConnected = true;
  return { context, page, info };
}

async function phoneSelect(page, ...ids) {
  const result = await page.evaluate(ids => {
    const phone = window.__LAZER.phone;
    phone.open();
    phone.home();
    for (const id of ids) if (!phone.select(id)) return { ok: false, id, view: phone.view?.title };
    return { ok: true, view: phone.view?.title };
  }, ids);
  assert(result.ok, JSON.stringify(result));
  return result;
}

try {
  const host = await client('Host'), friend = await client('Friend');
  evidence.steps.push('two separate browser identities connected to Friends');
  const hostId = await host.page.evaluate(() => window.__LAZER.friends.id);
  const friendId = await friend.page.evaluate(() => window.__LAZER.friends.id);
  assert(hostId && friendId && hostId !== friendId);
  hostCode = hostId;

  assert.equal((await phoneSelect(host.page, 'app-friends')).view, 'FRIENDS');
  assert.equal((await phoneSelect(host.page, 'app-friends', 'profile')).view, 'MY PROFILE');
  await phoneSelect(host.page, 'app-friends', 'profile', 'name');
  await host.page.waitForFunction(() => window.__LAZER.friends.name === 'Host');
  await phoneSelect(friend.page, 'app-friends', 'profile', 'name');
  await friend.page.waitForFunction(() => window.__LAZER.friends.name === 'Friend');
  evidence.steps.push('FRIENDS tile, Profile page, and name prompt selected');

  await phoneSelect(friend.page, 'app-friends', 'add');
  await host.page.waitForFunction(id => window.__LAZER.friends.requests.some(r => r.id === id), friendId);
  await phoneSelect(host.page, 'app-friends', 'accept-' + friendId);
  for (const { page } of [host, friend]) await page.waitForFunction(() => window.__LAZER.friends.friends.length === 1 && window.__LAZER.friends.friends[0].online);
  evidence.steps.push('friend request accepted and both presence indicators ONLINE');

  await phoneSelect(host.page, 'app-friends', 'room', 'create');
  phase = 'host room connection';
  await host.page.waitForFunction(() => window.__LAZER.network.status === 'Connected', null, { timeout: 45000 });
  roomCode = await host.page.evaluate(() => window.__LAZER.network.code);
  assert(roomCode);
  host.info.roomConnected = true;
  phase = 'host invite action';
  await phoneSelect(host.page, 'app-friends', 'friend-' + friendId, 'invite');
  phase = 'host invite acknowledgement';
  await host.page.waitForFunction(() => window.__LAZER.network.lastError === 'Invitation sent.' || window.__LAZER.network.lastError && window.__LAZER.network.lastError !== '', null, { timeout: 10000 });
  const inviteStatus = await host.page.evaluate(() => window.__LAZER.network.lastError);
  assert.equal(inviteStatus, 'Invitation sent.', inviteStatus);
  phase = 'recipient invitation delivery';
  await friend.page.waitForFunction(() => window.__LAZER.friends.invites.length > 0);
  const inviteId = await friend.page.evaluate(() => window.__LAZER.friends.invites[0].id);
  await phoneSelect(friend.page, 'app-friends', 'invite-accept-' + inviteId);
  for (const { page, info } of [host, friend]) {
    await page.waitForFunction(() => window.__LAZER.network.status === 'Connected' && window.__LAZER.network.remotes.size === 1, null, { timeout: 45000 });
    info.roomConnected = true;
    info.remoteRiders = 1;
  }
  evidence.steps.push('private room created, friend invited and accepted, each sees one distinct remote rider');
  await host.page.evaluate(() => window.__LAZER.phone.open('friends'));
  await host.page.screenshot({ path: artifacts + '/friends-host.png' });
  await friend.page.evaluate(() => window.__LAZER.phone.open('friends'));
  await friend.page.screenshot({ path: artifacts + '/friends-friend.png' });

  await friend.page.evaluate(() => {
    const s = window.__LAZER.sim;
    s.position.x += 8;
    s.previousPosition.copy(s.position);
    s.body.setTranslation(s.position, true);
  });
  await host.page.waitForFunction(() => [...window.__LAZER.network.remotes.values()].some(r => r.samples.at(-1)?.state?.position?.[0] > -6));
  const before = await host.page.evaluate(() => ({ x: window.__LAZER.sim.position.x, marker: JSON.stringify(window.__LAZER.sim.marker.saved) }));
  const friendPlayerId = await host.page.evaluate(id => window.__LAZER.network.roster.find(p => p.friendId === id)?.id, friendId);
  assert(friendPlayerId);
  await phoneSelect(host.page, 'app-friends', 'room', 'rider-' + friendPlayerId, 'teleport');
  await host.page.waitForFunction(x => Math.abs(window.__LAZER.sim.position.x - x) > 3, before.x, { timeout: 10000 });
  const after = await host.page.evaluate(() => ({ x: window.__LAZER.sim.position.x, marker: JSON.stringify(window.__LAZER.sim.marker.saved) }));
  assert.equal(after.marker, before.marker);
  evidence.steps.push('phone teleport moved safely near friend without changing saved marker');

  await phoneSelect(friend.page, 'app-messages', 'room', 'compose');
  await friend.page.locator('#social-chat input').fill('hello from the phone');
  await friend.page.locator('#social-chat input').press('Enter');
  await host.page.waitForFunction(() => window.__LAZER.messages.threads.get('room')?.some(m => m.text === 'hello from the phone' && !m.mine));
  const messagePage = await phoneSelect(host.page, 'app-messages', 'room');
  assert.equal(messagePage.view, 'MESSAGES');
  evidence.steps.push('phone Messages delivered room chat');

  await phoneSelect(friend.page, 'app-friends', 'room', 'leave');
  await friend.page.waitForFunction(() => window.__LAZER.network.status === 'Solo');
  await host.page.waitForFunction(() => window.__LAZER.network.remotes.size === 0);
  await phoneSelect(friend.page, 'app-friends', 'room', 'join');
  for (const { page } of [host, friend]) await page.waitForFunction(() => window.__LAZER.network.status === 'Connected' && window.__LAZER.network.remotes.size === 1, null, { timeout: 45000 });
  evidence.steps.push('left and rejoined with no duplicate remote rider');
  await friend.context.close();
  await host.page.waitForFunction(id => window.__LAZER.friends.friends.find(f => f.id === id)?.online === false, friendId, { timeout: 15000 });
  evidence.steps.push('friend presence changed to OFFLINE after browser context closed');
  evidence.result = 'PASS';
} catch (error) {
  evidence.result = 'FAIL';
  evidence.errors.push(phase + ': ' + String(error?.message || error).slice(0, 700));
} finally {
  writeFileSync(artifacts + '/friends-phone.json', JSON.stringify(evidence, null, 2));
  await browser.close();
  console.log(JSON.stringify({ result: evidence.result, steps: evidence.steps, clients: evidence.clients, errors: evidence.errors }, null, 2));
}
if (evidence.result !== 'PASS') process.exitCode = 1;
