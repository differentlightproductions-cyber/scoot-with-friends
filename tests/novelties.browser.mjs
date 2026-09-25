// Novelty items (#55): a level-up can give a Rubber Duck, Kazoo, Foam Finger, Party
// Popper or Bubble Wand. Held in the hand like a drink; using one plays its gesture
// and sound; the popper bursts confetti once and is then litter; bubbles float up.
//   LAZER_URL=http://127.0.0.1:5195 BROWSER_EXECUTABLE=... node tests/novelties.browser.mjs
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const url = process.env.LAZER_URL || 'http://127.0.0.1:5186', out = process.env.OUT || 'artifacts/novelties';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || process.env.CHROME_PATH, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [];
const check = (label, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${label} ${JSON.stringify(detail)}`); };
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } }), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url + '/?map=outdoor');
  await page.waitForFunction(() => window.__LAZER?.startSession, null, { timeout: 900000 });
  await page.evaluate(async () => { const g = window.__LAZER; g.testing(true); await g.startSession('outdoor', true); g.profile.settings.daylight = 'day'; g.profile.settings.liveSky = false; });
  const kinds = ['Rubber Duck', 'Kazoo', 'Foam Finger', 'Party Popper', 'Bubble Wand'];
  const used = await page.evaluate(async (kinds) => {
    const g = window.__LAZER, s = g.sim, { receiveItem } = await import('/src/data/items.ts'), { emptyInput } = await import('/src/input/input.ts'), out = {};
    const heard = []; g.events.on((e) => { if (e.type === 'worldInteraction' && e.interaction === 'novelty') heard.push(e.item); });
    s.walking = true; s.position.set(-6, 0.05, 8); s.previousPosition.copy(s.position); s.body.setTranslation(s.position, true); s.yaw = 0;
    for (const kind of kinds) {
      const item = receiveItem(g.profile.pockets, kind); g.interactions.hold(item.id);
      for (let i = 0; i < 10; i++) { g.advance(1 / 60, {}, true); g.render(); }
      const f = emptyInput(); f.pressed[g.profile.pockets.useAction] = true; f.held[g.profile.pockets.useAction] = 1;
      g.interactions.update(s, f, 1 / 60, true);
      const emote = s.emote?.id ?? null;
      for (let i = 0; i < 20; i++) { g.interactions.update(s, emptyInput(), 1 / 30, true); }
      const after = g.profile.pockets.entries.find((e) => e.id === item.id);
      out[kind] = { emote, state: after?.state, props: g.interactions.prop.children.length > 0 };
      for (let i = 0; i < 120; i++) g.interactions.update(s, emptyInput(), 1 / 30, true);
    }
    out.heard = heard;
    return out;
  }, kinds);
  check('Each novelty plays its gesture and sound', kinds.every((k) => used[k].emote && used.heard.includes(k)), used);
  check('The popper is used up (litter in the hand); the others can be used again', used['Party Popper'].state === 'empty' && kinds.filter((k) => k !== 'Party Popper').every((k) => used[k].state === 'sealed'), used);

  // Pictures: each novelty in the hand, and the popper's confetti.
  for (const kind of [...kinds, 'confetti']) {
    const shot = await page.evaluate(async (kind) => {
      const g = window.__LAZER, s = g.sim, { receiveItem } = await import('/src/data/items.ts'), { emptyInput } = await import('/src/input/input.ts');
      if (kind === 'confetti') { const item = receiveItem(g.profile.pockets, 'Party Popper'); g.interactions.hold(item.id); for (let i = 0; i < 4; i++) { g.advance(1 / 60, {}, true); g.render(); } const f = emptyInput(); f.pressed[g.profile.pockets.useAction] = true; g.interactions.update(s, f, 1 / 60, true); for (let i = 0; i < 9; i++) g.interactions.update(s, emptyInput(), 1 / 30, true); }
      else { const item = g.profile.pockets.entries.find((e) => e.kind === kind && e.state !== 'empty') ?? receiveItem(g.profile.pockets, kind); g.interactions.hold(item.id); s.emote = null; }
      for (let i = 0; i < 6; i++) { g.advance(1 / 60, {}, true); g.render(); }
      const cam = g.camera.camera, hand = g.rider.hands[0].getWorldPosition(cam.position.clone());
      const at = kind === 'confetti' ? s.position.clone().add({ x: 0, y: 1.6, z: 0.6 }) : hand;
      cam.position.copy(at).add(kind === 'confetti' ? { x: 1.8, y: 0.4, z: 2.4 } : { x: 0.55, y: 0.18, z: 0.62 }); cam.lookAt(at); cam.updateMatrixWorld();
      g.renderer.render(g.park.scene, cam);
      return g.renderer.domElement.toDataURL('image/jpeg', 0.85);
    }, kind);
    writeFileSync(`${out}/${kind.toLowerCase().replace(/ /g, '-')}.jpg`, Buffer.from(shot.split(',')[1], 'base64'));
  }
  check('No page errors', errors.length === 0, errors.slice(0, 3));
} finally { await browser.close(); }
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
