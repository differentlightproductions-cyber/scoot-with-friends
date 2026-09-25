// "With Friends" first slice (#47): the park's locals stand around at Veterans,
// small throwables lie about; B picks one up, RT throws it (aimed at the person in
// front), the local reacts and may throw back; RT beside someone shoves them (a
// bounded stumble, then a cooldown); PLAYFUL CONTACT OFF turns hits on you cosmetic.
//   LAZER_URL=http://127.0.0.1:5195 BROWSER_EXECUTABLE=... node tests/friends.browser.mjs
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const url = process.env.LAZER_URL || 'http://127.0.0.1:5186', out = process.env.OUT || 'artifacts/friends';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || process.env.CHROME_PATH, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [];
const check = (label, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${label} ${JSON.stringify(detail)}`); };
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url + '/?map=outdoor');
  await page.waitForFunction(() => window.__LAZER?.startSession, null, { timeout: 900000 });
  const setup = await page.evaluate(async () => {
    const g = window.__LAZER; g.testing(true); await g.startSession('outdoor', true);
    const f = g.playful;
    window.__step = async (n, values = {}) => {
      const { emptyInput } = await import('/src/input/input.ts');
      for (let i = 0; i < n; i++) {
        const frame = { ...emptyInput(), ...values, pressed: { ...emptyInput().pressed, ...(i === 0 ? values.pressed : {}) }, held: { ...emptyInput().held, ...values.held } };
        g.playful.update(1 / 30, frame, g.sim, true, null, () => {});
        g.advance(1 / 30, {}, false);
      }
    };
    return { npcs: f?.npcs.length ?? 0, inScene: f?.npcs.every((n) => !!n.model.root.parent) };
  });
  check('Five locals hang out at Veterans', setup.npcs === 5 && setup.inScene, setup);

  // Walk to the DIY lot beside the local there; pick up the can with B.
  const pick = await page.evaluate(async () => {
    const g = window.__LAZER, s = g.sim, f = g.playful;
    s.walking = true; s.position.set(-44.4, 0.05, -118.4); s.previousPosition.copy(s.position); s.body.setTranslation(s.position, true); s.yaw = Math.PI; s.previousYaw = s.yaw;
    await window.__step(15);
    const prompt = f.prompt.hidden ? '' : f.prompt.textContent;
    await window.__step(2, { pressed: { brakeBars: true } });
    return { prompt, carried: f.carried?.kind ?? null, after: f.prompt.hidden ? '' : f.prompt.textContent };
  });
  check('B picks up the can; the prompt offers the throw', /Pick up empty can/.test(pick.prompt) && pick.carried === 'can' && /RT · Throw empty can/.test(pick.after), pick);

  // Face the local and throw: it is aimed at them, it hits, they react and remember.
  const thrown = await page.evaluate(async () => {
    const g = window.__LAZER, s = g.sim, f = g.playful, npc = f.npcs[2];
    s.position.set(npc.position.x + 6, 0.05, npc.position.z); s.body.setTranslation(s.position, true); s.yaw = -Math.PI / 2; s.previousYaw = s.yaw;
    await window.__step(3);
    await window.__step(1, { pressed: { pumpGrind: true } });
    await window.__step(40);
    const last = npc.log.at(-1) ?? null;
    return { hit: last, grudge: !!npc.grudge, events: f.events.map((e) => e.type) };
  });
  check('RT throws it at the local in front; it lands as a flinch and they react', thrown.hit?.source === 'local' && thrown.hit?.strength === 'flinch' && !!thrown.hit?.emote && thrown.events.includes('ThrowItem') && thrown.events.includes('ItemImpact'), thrown);

  // Retaliation: force it and check the throw comes back and lands on the player.
  const back = await page.evaluate(async () => {
    const g = window.__LAZER, f = g.playful, npc = f.npcs[2];
    npc.retaliate = { at: 0, source: 'local', item: 'acorn' };
    await window.__step(60);
    return { local: f.local.last, feedback: document.querySelector('#feedback')?.textContent ?? '' };
  });
  check('The local throws one back and it lands on the player (BONK)', back.local?.source === 'local-3' && back.local?.strength === 'flinch', back);

  // Shove: a stumble that moves them a bounded distance; an instant repeat does nothing.
  const shove = await page.evaluate(async () => {
    const g = window.__LAZER, s = g.sim, f = g.playful, npc = f.npcs[0];
    s.position.set(npc.position.x - 1.1, 0.05, npc.position.z); s.body.setTranslation(s.position, true); s.yaw = Math.PI / 2; s.previousYaw = s.yaw; s.velocity.set(0, 0, 0);
    await window.__step(3);
    const before = npc.position.clone(), logs = npc.log.length;
    await window.__step(1, { pressed: { pumpGrind: true } });
    await window.__step(1, { pressed: { pumpGrind: true } });
    await window.__step(30);
    return { moved: +before.distanceTo(npc.position).toFixed(2), reactions: npc.log.length - logs, strength: npc.log.at(-1)?.strength };
  });
  check('RT shoves the local: they slide under 1.5 m; the instant repeat is ignored', shove.moved > 0.2 && shove.moved < 1.5 && shove.reactions === 1 && shove.strength === 'push', shove);

  // PLAYFUL CONTACT OFF: a hit on you only bounces off.
  const off = await page.evaluate(async () => {
    const g = window.__LAZER, f = g.playful, npc = f.npcs[2];
    g.profile.settings.playfulContact = 'off'; f.rules.contact = 'off';
    const s = g.sim; s.position.set(npc.position.x + 5, 0.05, npc.position.z); s.body.setTranslation(s.position, true);
    npc.retaliate = { at: 0, source: 'local', item: 'acorn' };
    f.local.last = null;
    await window.__step(60);
    return f.local.last;
  });
  check('PLAYFUL CONTACT OFF: the throw back only bounces off (cosmetic)', off?.strength === 'cosmetic', off);

  // A picture: the rider and a local at the DIY lot.
  const shot = await page.evaluate(async () => {
    const g = window.__LAZER, s = g.sim, npc = g.playful.npcs[2];
    s.position.set(npc.position.x + 2.2, 0.05, npc.position.z + 1.2); s.body.setTranslation(s.position, true); s.yaw = -Math.PI / 2;
    npc.play('laugh');
    for (let i = 0; i < 20; i++) { g.playful.update(1 / 30, (await import('/src/input/input.ts')).emptyInput(), s, true, null, () => {}); g.advance(1 / 30, {}, false); }
    for (let i = 0; i < 4; i++) g.render();
    const cam = g.camera.camera; cam.position.set(npc.position.x + 4.5, 1.9, npc.position.z + 5.5); cam.lookAt(npc.position.x + 1, 1, npc.position.z); cam.updateMatrixWorld();
    g.renderer.render(g.park.scene, cam);
    return g.renderer.domElement.toDataURL('image/jpeg', 0.85);
  });
  writeFileSync(`${out}/local-at-diy.jpg`, Buffer.from(shot.split(',')[1], 'base64'));
  check('No page errors', errors.length === 0, errors.slice(0, 3));
} finally {
  await browser.close();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
