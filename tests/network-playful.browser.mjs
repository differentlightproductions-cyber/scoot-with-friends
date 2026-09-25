// Two real browser clients and the local room server, with gameplay events
// crossing WebSockets. Start the dev server and room server before running.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const url = process.env.LAZER_URL || 'http://127.0.0.1:5184';
const endpoint = process.env.ROOM_URL || 'ws://127.0.0.1:8789';
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
const errors = [];
const contexts = [];
try {
  const pages = [];
  for (let i = 0; i < 2; i++) {
    const context = await browser.newContext({ viewport: { width: 900, height: 600 } });
    contexts.push(context);
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(url + '/?map=outdoor');
    await page.waitForFunction(() => window.__LAZER?.startSession, null, { timeout: 120000 });
    await page.evaluate(async endpoint => {
      const g = window.__LAZER;
      await g.startSession('outdoor', true);
      g.hud.start();
      g.hud.setPaused(false);
      g.profile.settings.playfulContact = 'full';
      Object.defineProperty(g.network, 'endpoint', { value: endpoint });
      window.__playfulEvents = [];
      const original = g.network.onPlayful;
      g.network.onPlayful = event => { window.__playfulEvents.push(event); original(event); };
    }, endpoint);
    pages.push(page);
  }
  const [host, guest] = pages;
  await host.evaluate(() => window.__LAZER.network.connect('create', 'Thrower'));
  await host.waitForFunction(() => window.__LAZER.network.status === 'Connected');
  const code = await host.evaluate(() => window.__LAZER.network.code);
  await guest.evaluate(code => window.__LAZER.network.connect('join', 'Receiver', code), code);
  await guest.waitForFunction(() => window.__LAZER.network.status === 'Connected');

  // Place both real riders on level ground, away from the park's NPCs.
  for (const [page, z] of [[host, -60], [guest, -58.8]]) {
    await page.evaluate(z => {
      const g = window.__LAZER, s = g.sim;
      s.position.set(10, g.terrainHeight(10, z) + .22, z);
      s.previousPosition.copy(s.position);
      s.body.setTranslation(s.position, true);
      s.velocity.set(0, 0, 0);
      s.body.setLinvel(s.velocity, true);
      s.yaw = s.previousYaw = 0;
      s.walking = s.grounded = true;
      s.state = 'Walking';
    }, z);
  }
  await host.waitForFunction(() => window.__LAZER.playful?.remotes.length === 1, null, { timeout: 10000 });
  await guest.waitForFunction(() => window.__LAZER.playful?.remotes.length === 1, null, { timeout: 10000 });
  // Server spawn grace is measured in real room ticks.
  await guest.waitForTimeout(3400);

  const hostId = await host.evaluate(() => window.__LAZER.network.id);
  const guestId = await guest.evaluate(() => window.__LAZER.network.id);
  await host.evaluate(() => {
    const g = window.__LAZER, s = g.sim;
    g.playful.throwFrom('local', 'acorn', s.position.clone().setY(s.position.y + 1.45), s.yaw, g.playful.remotes[0]);
  });
  await guest.waitForFunction(id => window.__playfulEvents.some(e => e.type === 'ThrowItem' && e.source === id), hostId);
  await guest.waitForFunction(id => window.__playfulEvents.some(e => e.type === 'ItemImpact' && e.source === id && e.target === window.__LAZER.network.id), hostId);
  const throwResult = await guest.evaluate(id => ({
    throwSeen: window.__playfulEvents.some(e => e.type === 'ThrowItem' && e.source === id),
    networkProp: window.__LAZER.playful.things.some(t => t.thrower === 'network:' + id),
    impact: window.__LAZER.playful.local.last,
  }), hostId);
  assert(throwResult.throwSeen && throwResult.networkProp, 'guest did not see the remote thrown item');
  assert.equal(throwResult.impact?.source, hostId);
  assert.equal(throwResult.impact?.strength, 'flinch');
  console.log('PASS two clients see ThrowItem and authoritative ItemImpact', throwResult);

  await host.evaluate(() => {
    const g = window.__LAZER, s = g.sim, target = g.playful.remotes[0];
    g.playful.deliver(target, { kind: 'shove', source: 'local', from: s.position.clone(), direction: target.position.clone().sub(s.position).setY(0).normalize(), strength: 'push' });
  });
  await guest.waitForFunction(id => window.__playfulEvents.some(e => e.type === 'ShoveRequest' && e.source === id && e.target === window.__LAZER.network.id), hostId);
  const shove = await guest.evaluate(() => window.__LAZER.playful.local.last);
  assert.equal(shove?.strength, 'push');
  console.log('PASS receiver gets server-approved ShoveRequest', shove);

  await guest.evaluate(() => { window.__LAZER.profile.settings.playfulContact = 'off'; window.__LAZER.playful.local.last = null; });
  await guest.waitForTimeout(1500); // adapter sends the changed contact; shove cooldown expires
  await host.evaluate(() => {
    const g = window.__LAZER, s = g.sim, target = g.playful.remotes[0];
    g.playful.deliver(target, { kind: 'shove', source: 'local', from: s.position.clone(), direction: target.position.clone().sub(s.position).setY(0).normalize(), strength: 'push' });
  });
  await guest.waitForFunction(() => window.__LAZER.playful.local.last?.strength === 'cosmetic');
  console.log('PASS contact off makes remote shove cosmetic');

  const beforeNpc = await guest.evaluate(() => window.__playfulEvents.length);
  await host.evaluate(() => {
    const g = window.__LAZER, npc = g.playful.npcs[0];
    g.playful.throwFrom(npc.id, 'acorn', npc.hand(), npc.yaw, g.playful.local);
  });
  await guest.waitForTimeout(350);
  const afterNpc = await guest.evaluate(() => window.__playfulEvents.length);
  assert.equal(afterNpc, beforeNpc, 'NPC throw left its local client');
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('PASS NPC events stay local; no page errors', { hostId, guestId });
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
}
