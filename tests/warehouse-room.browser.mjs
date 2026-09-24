import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const errors = [];
const pages = [];
async function page() {
  const context = await browser.newContext();
  const p = await context.newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto('http://127.0.0.1:5182/?map=outdoor');
  await p.waitForFunction(() => window.__LAZER?.rider?.avatar);
  pages.push(p);
  return p;
}
async function place(p, asset = 'bank', x = 0, z = 0) {
  await p.evaluate(async ({ asset, x, z }) => {
    const g = window.__LAZER;
    const [{ pieceObject }, { buildAsset }, { emptyInput }] = await Promise.all([import('/src/editor/warehouse.ts'), import('/src/data/builds.ts'), import('/src/input/input.ts')]);
    g.builder.begin(pieceObject(buildAsset(asset), x, z, 0));
    const f = emptyInput(); f.pressed.hop = true;
    g.builder.update(g.sim, f, 1 / 60);
  }, { asset, x, z });
}
async function count(p, count) { await p.waitForFunction(n => window.__LAZER.builder.layout.objects.length === n, count); }

try {
  const host = await page(), friend = await page();
  // A personal save exists before the room and must return after leaving it.
  await host.evaluate(() => window.__LAZER.startSession('warehouse', true));
  await place(host);
  await count(host, 1);
  assert.equal(await host.evaluate(() => window.__LAZER.profile.builds.warehouse.pieces.length), 1);
  await host.evaluate(() => window.__LAZER.network.connect('create', 'Host'));
  await host.waitForFunction(() => window.__LAZER.network.status === 'Connected' || window.__LAZER.network.lastError, null, { timeout: 60000 });
  console.log('host connection', await host.evaluate(() => ({ status: window.__LAZER.network.status, error: window.__LAZER.network.lastError, endpoint: window.__LAZER.network.endpoint, errors: window.__LAZER.network.roster.length })));
  assert.equal(await host.evaluate(() => window.__LAZER.network.status), 'Connected');
  const code = await host.evaluate(() => window.__LAZER.network.code);
  console.log('joining friend');
  await friend.evaluate(code => window.__LAZER.network.connect('join', 'Friend', code), code);
  console.log('friend connect sent');
  await friend.waitForFunction(() => window.__LAZER.network.status === 'Connected');
  console.log('friend connected, switching to Warehouse');
  await host.evaluate(() => window.__LAZER.network.changeMap('warehouse'));
  console.log('Warehouse change sent');
  for (const p of [host, friend]) await p.waitForFunction(() => window.__LAZER.network.status === 'Connected' && window.__LAZER.network.map === 'warehouse' && window.__LAZER.builder.isShared, null, { timeout: 120000 });
  console.log('both in Warehouse');
  await count(host, 0); await count(friend, 0);
  await host.evaluate(() => window.__LAZER.network.send({ type: 'chat', message: 'Warehouse hello' }));
  await friend.waitForFunction(() => window.__LAZER.messages.threads.get('room')?.some(m => m.text === 'Warehouse hello'));
  const phoneUI = await friend.evaluate(() => {
    const g = window.__LAZER;
    g.testing(true); g.sim.reset(0, true);
    g.phoneStep({ held: { menuDown: 1 } }, 0.3);
    g.phoneStep({ held: { menuDown: 1 } }, 0.3);
    const opened = g.phone.active;
    g.phone.select('app-build');
    const build = JSON.stringify(g.phone.view?.page());
    g.phone.home(); g.phone.select('app-messages');
    const messages = JSON.stringify(g.phone.view?.page());
    g.phoneStep({ held: { menuDown: 0 } }, 1 / 60);
    g.phoneStep({ held: { menuDown: 1 } }, 0.3);
    g.phoneStep({ held: { menuDown: 1 } }, 0.3);
    return { opened, closing: g.phone.state === 'away', buildToggle: build.includes('OTHER PLAYER BUILDS'), roomChat: messages.includes('Warehouse hello') };
  });
  assert(Object.values(phoneUI).every(Boolean), JSON.stringify(phoneUI));

  await place(host, 'flat-rail');
  await count(host, 1); await count(friend, 1);
  const id = await host.evaluate(() => window.__LAZER.builder.layout.objects[0].id);
  assert.equal(await friend.evaluate(() => window.__LAZER.builder.canEdit(window.__LAZER.builder.layout.objects[0].id)), false);
  assert.equal(await host.evaluate(() => window.__LAZER.builder.ownerOf(window.__LAZER.builder.layout.objects[0].id) === window.__LAZER.network.id), true);

  await host.evaluate(async id => {
    const g = window.__LAZER, { emptyInput } = await import('/src/input/input.ts');
    g.builder.move(id);
    const turn = emptyInput(); turn.pressed.rightModifier = true; turn.pressed.marker = true;
    g.builder.update(g.sim, turn, 1 / 60);
    const confirm = emptyInput(); confirm.pressed.hop = true;
    g.builder.update(g.sim, confirm, 1 / 60);
  }, id);
  await friend.waitForFunction(id => { const o = window.__LAZER.builder.layout.objects.find(o => o.id === id); return o && o.z !== 0 && o.rotation !== 0; }, id);
  const moved = await friend.evaluate(id => { const o = window.__LAZER.builder.layout.objects.find(o => o.id === id); return [o.x, o.z, o.rotation]; }, id);
  assert(Math.abs(moved[2]) > 0.01);

  const ghost = await friend.evaluate(id => {
    const g = window.__LAZER, b = g.builder;
    b.setOtherBuilds('ghost');
    const item = b.built.get(id);
    let visible = false, opacity = 1;
    item.group.traverse(o => { if (o.isMesh) { visible = true; opacity = Math.min(opacity, o.material.opacity); } });
    return { visible, opacity, colliders: item.handles.filter(h => g.park.world.getCollider(h)).length, rails: item.handles.filter(h => g.park.railHandles.has(h)).length };
  }, id);
  assert(ghost.visible && ghost.opacity < 0.5 && ghost.colliders === 0 && ghost.rails === 0, JSON.stringify(ghost));
  await friend.evaluate(() => window.__LAZER.builder.setOtherBuilds('solid'));
  assert(await friend.evaluate(id => { const g = window.__LAZER, item = g.builder.built.get(id); return item.handles.some(h => !!g.park.world.getCollider(h)); }, id));

  await place(host, 'bank', 15, 0);
  await count(host, 2); await count(friend, 2);
  const bankId = await host.evaluate(() => window.__LAZER.builder.layout.objects.find(o => o.asset === 'bank').id);
  const heights = await friend.evaluate(() => {
    const g = window.__LAZER;
    g.builder.setOtherBuilds('ghost');
    const ghost = g.park.groundHeight(15, 0);
    g.builder.setOtherBuilds('solid');
    return { ghost, solid: g.park.groundHeight(15, 0) };
  });
  assert(heights.solid > heights.ghost + 0.2, JSON.stringify(heights));

  const late = await page();
  await late.evaluate(code => window.__LAZER.network.connect('join', 'Late', code), code);
  await late.waitForFunction(() => window.__LAZER.network.status === 'Connected' && window.__LAZER.builder.isShared && window.__LAZER.builder.layout.objects.length === 2, null, { timeout: 120000 });
  assert(await late.evaluate(id => window.__LAZER.builder.layout.objects.some(o => o.id === id), id));
  await friend.evaluate(id => window.__LAZER.network.send({ type: 'build', generation: window.__LAZER.network.generation, action: 'delete', id }), id);
  await friend.waitForTimeout(200);
  assert.equal(await host.evaluate(() => window.__LAZER.builder.layout.objects.length), 2);
  await host.evaluate(id => window.__LAZER.builder.deletePiece(id), id);
  for (const p of [host, friend, late]) await count(p, 1);
  await host.evaluate(id => window.__LAZER.builder.deletePiece(id), bankId);
  for (const p of [host, friend, late]) await count(p, 0);
  await place(host, 'bank', 15, 0);
  await place(friend, 'bank', 22, 0);
  for (const p of [host, friend, late]) await count(p, 2);
  await host.evaluate(() => window.__LAZER.builder.reset());
  for (const p of [host, friend, late]) await count(p, 1);
  assert.equal(await host.evaluate(() => window.__LAZER.builder.layout.objects[0].asset), 'bank');
  await host.evaluate(() => window.__LAZER.network.leave());
  await host.waitForFunction(() => !window.__LAZER.builder.isShared && window.__LAZER.builder.layout.objects.length === 1);
  assert.equal(await host.evaluate(() => window.__LAZER.profile.builds.warehouse.pieces.length), 1);
  assert.deepEqual(errors, []);
  console.log('PASS Warehouse room create, move/rotate, ownership, ghost collisions/heights, late join, delete, clear-own, personal save restore');
} finally { await browser.close(); }
