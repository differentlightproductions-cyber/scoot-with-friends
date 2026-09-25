// Trash cans and litter (#58): cans stand in every service row, each picnic
// pavilion and by the DIY lot; beside one, B throws carried litter away (someone
// else's counts toward Clean-Up Crew, your own empties do not); an empty can in
// the pockets goes in without a "use item" prompt; the locals leave litter about.
//   LAZER_URL=http://127.0.0.1:5195 BROWSER_EXECUTABLE=... node tests/litter.browser.mjs
import { chromium } from 'playwright';
const url = process.env.LAZER_URL || 'http://127.0.0.1:5186';
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || process.env.CHROME_PATH, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [];
const check = (label, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${label} ${JSON.stringify(detail)}`); };
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } }), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url + '/?map=outdoor');
  await page.waitForFunction(() => window.__LAZER?.startSession, null, { timeout: 900000 });
  const setup = await page.evaluate(async () => {
    const g = window.__LAZER; g.testing(true); await g.startSession('outdoor', true); g.renderer.render = () => {};
    const { emptyInput } = await import('/src/input/input.ts');
    // Steps the playful layer and the game as main.ts does, with an optional pocket empty.
    window.__step = (n, values = {}, held = null) => {
      let out = null;
      for (let i = 0; i < n; i++) {
        const frame = { ...emptyInput(), pressed: { ...emptyInput().pressed, ...(i === 0 ? values.pressed : {}) } };
        out = g.playful.update(1 / 30, frame, g.sim, true, held, () => { window.__dropped = (window.__dropped ?? 0) + 1; });
        g.advance(1 / 30, {}, false);
      }
      return out;
    };
    window.__place = (x, z, yaw = 0, y = g.terrainHeight(x, z)) => { const s = g.sim; s.walking = true; s.position.set(x, y + 0.05, z); s.previousPosition.copy(s.position); s.body.setTranslation(s.position, true); s.velocity.set(0, 0, 0); s.body.setLinvel(s.velocity, true); s.yaw = yaw; s.previousYaw = yaw; };
    return { bins: g.playful.bins.length, same: g.playful.bins === g.interactions.bins, colliders: g.interactions.bins.map((b) => [+b.x.toFixed(1), +b.z.toFixed(1)]) };
  });
  check('Fourteen trash cans: four service rows, six pavilions, the DIY lot, three lawns', setup.bins === 14 && setup.same, setup);

  // Someone else's can: pick it up, walk to the west row's can, B throws it away.
  const binned = await page.evaluate(async () => {
    const g = window.__LAZER, f = g.playful, bin = f.bins[1], events = [];
    g.events.on((e) => { if (e.type === 'worldInteraction' && e.interaction === 'bin') events.push(e); });
    const lying = f.spawn('can', bin.clone().set(bin.x, g.terrainHeight(bin.x, bin.z + 3) + 0.04, bin.z + 3));
    lying.thrower = 'local-1';
    window.__place(bin.x, bin.z + 3.4, Math.PI);
    window.__step(4);
    const pickPrompt = f.prompt.hidden ? '' : f.prompt.textContent;
    window.__step(2, { pressed: { brakeBars: true } });
    const carried = f.carried?.kind ?? null;
    window.__place(bin.x, bin.z + 1.1, Math.PI);
    window.__step(3);
    const prompt = f.prompt.hidden ? '' : f.prompt.textContent;
    const pendingBefore = g.missions.pending.litter ?? 0;
    const out = window.__step(1, { pressed: { brakeBars: true } });
    const mid = { state: lying.state, visible: lying.mesh.visible };
    window.__step(20);
    return { pickPrompt, carried, prompt, consumed: out.pressed.brakeBars === false, mid, gone: !f.things.includes(lying) && !lying.mesh.parent, litter: (g.missions.pending.litter ?? 0) - pendingBefore, events: events.length, feedback: document.querySelector('#feedback')?.textContent ?? '' };
  });
  check('Carried litter beside a can: the prompt offers B · Throw it away', /Pick up empty can/.test(binned.pickPrompt) && binned.carried === 'can' && /B · Throw it away/.test(binned.prompt), binned);
  check('B bins it: it arcs in, is gone, and counts once toward Clean-Up Crew', binned.consumed && binned.mid.state === 'binned' && binned.gone && binned.litter === 1 && binned.events === 1 && /CLEAN-UP CREW/.test(binned.feedback), binned);

  // Your own empty from the pockets: offered and binned, but it does not count.
  const own = await page.evaluate(async () => {
    const g = window.__LAZER, f = g.playful, bin = f.bins[6];
    window.__place(bin.x - 1.1, bin.z, Math.PI / 2, bin.y - 0.95);
    window.__dropped = 0;
    window.__step(3, {}, 'can');
    const prompt = f.prompt.hidden ? '' : f.prompt.textContent;
    const before = g.missions.pending.litter ?? 0;
    window.__step(1, { pressed: { brakeBars: true } }, 'can');
    window.__step(20);
    const away = f.prompt.hidden ? '' : f.prompt.textContent;
    window.__place(bin.x - 6, bin.z, Math.PI / 2, bin.y - 0.95);
    window.__step(12, {}, 'can');
    return { prompt, dropped: window.__dropped, litter: (g.missions.pending.litter ?? 0) - before, feedback: document.querySelector('#feedback')?.textContent ?? '', away, far: f.prompt.hidden ? '' : f.prompt.textContent };
  });
  check('A pocket empty beside a pavilion can: binned, taken from the pockets, not counted', /B · Throw it away/.test(own.prompt) && own.dropped === 1 && own.litter === 0 && /BINNED/.test(own.feedback) && !/CREW/.test(own.feedback), own);
  check('Away from a can an empty only offers the throw (no use-item B)', /^RT · Throw empty can$/.test(own.far), own);

  // An empty held item shows no "use held item" prompt; a sealed one does (the control).
  const usePrompt = await page.evaluate(async () => {
    const g = window.__LAZER, i = g.interactions, p = g.profile.pockets, { emptyInput } = await import('/src/input/input.ts');
    window.__place(0, 60, 0); window.__step(4);
    const read = () => { i.prompt.hidden = true; i.update(g.sim, emptyInput(), 1 / 30, true); return i.prompt.hidden ? '' : i.prompt.textContent; };
    const saved = { entries: p.entries, held: p.held };
    p.entries = [{ id: 'item-900', kind: 'Soda', state: 'empty' }]; p.held = 'item-900';
    const empty = read();
    p.entries[0].state = 'sealed';
    const sealed = read();
    p.entries = saved.entries; p.held = saved.held;
    return { empty, sealed };
  });
  check('An empty held can shows no "use held item" prompt; a sealed one does', !/Use held item/.test(usePrompt.empty) && /Use held item/.test(usePrompt.sealed), usePrompt);

  // The locals leave litter now and then (the timer forced), never past ten pieces.
  const dropped = await page.evaluate(async () => {
    const g = window.__LAZER, f = g.playful, before = f.litter;
    f.litterIn = 0; window.__step(1);
    const one = f.litter - before;
    for (let i = 0; i < 20; i++) { f.litterIn = 0; window.__step(1); }
    return { one, total: f.litter };
  });
  check('A local drops litter when due, capped at ten pieces lying about', dropped.one === 1 && dropped.total <= 10 && dropped.total >= 1, dropped);
  // A chip bag tossed down spills its last crumbs beside it for the doves (#78); a can does not.
  const crumbs = await page.evaluate(async () => {
    const g = window.__LAZER, f = g.playful, d = g.doves;
    const count = () => d.food.filter((o) => o.kind === 'crumb').length;
    const toss = (kind, x, z) => { const from = g.sim.position.clone().set(x, g.terrainHeight(x, z) + 1.2, z); f.throwFrom('local', kind, from, 0, null); for (let i = 0; i < 90; i++) window.__step(1); };
    const start = count();
    toss('can', -30, 12); const afterCan = count();
    toss('wrapper', -34, 12); const after = count();
    const bag = f.things.filter((t) => t.kind === 'wrapper' && t.state === 'ground').at(-1)?.mesh.position;
    const near = bag ? d.food.filter((o) => o.kind === 'crumb').slice(-3).map((o) => +Math.hypot(o.position.x - bag.x, o.position.z - bag.z).toFixed(2)) : [];
    return { start, afterCan, after, near };
  });
  check('A tossed chip bag spills three crumbs beside it for the doves; a can spills none', crumbs.afterCan === crumbs.start && crumbs.after - crumbs.afterCan === 3 && crumbs.near.every((r) => r < 0.35), crumbs);
  check('No page errors', errors.length === 0, errors.slice(0, 3));
} finally {
  await browser.close();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
