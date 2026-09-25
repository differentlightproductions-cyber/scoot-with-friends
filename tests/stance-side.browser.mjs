// Stance audit (#24): off the scooter it stays on the stance side (Regular on the
// rider's RIGHT, Goofy on the LEFT) while standing and walking, and back on it
// after remounting; rolling fakie or taking the phone out never changes the
// stance or which foot pushes. Rider-local space: RIGHT is -x, LEFT is +x.
//   LAZER_URL=http://127.0.0.1:5195 BROWSER_EXECUTABLE=... node tests/stance-side.browser.mjs
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || process.env.CHROME_PATH, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [];
const check = (label, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${label} ${JSON.stringify(detail)}`); };
try {
  const page = await browser.newPage({ viewport: { width: 480, height: 300 } }), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto((process.env.LAZER_URL || 'http://127.0.0.1:5186') + '/?map=outdoor');
  await page.waitForFunction(() => window.__LAZER?.startSession, null, { timeout: 900000 });
  const r = await page.evaluate(async () => {
    const g = window.__LAZER; g.testing(true); await g.startSession('outdoor', true);
    g.renderer.render = () => {};
    const s = g.sim, model = g.rider, out = {};
    const { pushFoot } = await import('/src/core/stance.ts');
    const side = () => { model.root.updateMatrixWorld(true); const x = model.scooter.position.x; return x < -0.2 ? 'right' : x > 0.2 ? 'left' : 'under'; };
    const frames = (n, f = {}) => { for (let i = 0; i < n; i++) { g.advance(1 / 60, f, false); g.render(); } };
    for (const stance of ['regular', 'goofy']) {
      s.reset(0, true); g.advance(0.3, {}, false);
      s.tricks.stance = stance; g.profile.settings.stance = stance;
      frames(20);
      const mounted = side();
      // Dismount (Y) and stand, then walk forward.
      s.walking = true; frames(90);
      const standing = side();
      frames(90, { lean: -1 });
      const walking = side();
      // The phone out does not move it or change the stance.
      g.phone.open(); frames(40); const phone = { side: side(), stance: s.tricks.stance }; g.phone.stow(); frames(20);
      // Remount and ride fakie: the stance and push foot stay.
      s.walking = false; frames(60);
      s.velocity.set(-Math.sin(s.yaw) * 4, 0, -Math.cos(s.yaw) * 4); s.body.setLinvel(s.velocity, true); frames(30);
      const fakie = { mode: s.fakie.mode, stance: s.tricks.stance, pushFoot: pushFoot(s.tricks.stance) };
      s.walking = true; frames(90);
      const afterRemount = side();
      out[stance] = { mounted, standing, walking, phone, fakie, afterRemount };
    }
    return out;
  });
  for (const [stance, want] of [['regular', 'right'], ['goofy', 'left']]) {
    const o = r[stance];
    check(`${stance}: off the scooter it stays on the rider's ${want.toUpperCase()} (standing, walking, after remounting)`, o.standing === want && o.walking === want && o.afterRemount === want, o);
    check(`${stance}: taking the phone out keeps the side and the stance`, o.phone.side === want && o.phone.stance === stance, o.phone);
    check(`${stance}: rolling fakie keeps the stance and the push foot`, o.fakie.mode === 'Fakie' && o.fakie.stance === stance && o.fakie.pushFoot === (stance === 'regular' ? 'right' : 'left'), o.fakie);
  }
  check('No page errors', errors.length === 0, errors.slice(0, 3));
} finally {
  await browser.close();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
