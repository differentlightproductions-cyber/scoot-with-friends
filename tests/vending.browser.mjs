// Vending machines (#88): a glass-front machine after the owner's photo. Its
// own keypad keys a two-digit code; the phone held to the reader pays in Coins
// (a beep, or "transaction declined, add funds?"); the product drops into the
// bin behind the PUSH flap and A takes it into the pockets and the hand. The
// shelves never run out.
//   LAZER_URL=http://127.0.0.1:5195 BROWSER_EXECUTABLE=... node tests/vending.browser.mjs
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
  const r = await page.evaluate(async () => {
    const g = window.__LAZER; g.testing(true); await g.startSession('outdoor', true); g.renderer.render = () => {};
    const it = g.interactions, sim = g.sim, out = {};
    const V = g.park.scene.position.constructor;
    const f = (pressed = {}, steer = 0, lean = 0) => ({ steer, lean, rx: 0, ry: 0, held: {}, pressed, released: {} });
    // A frame of the game as main.ts runs it; now and then the page's own tasks (the wallet's) get a turn.
    const yieldTask = () => new Promise((done) => { const c = new MessageChannel(); c.port1.onmessage = () => done(); c.port2.postMessage(0); });
    let n = 0;
    const step = async (input = f()) => { it.update(sim, input, 1 / 60); g.advance(1 / 60, {}, false); if (++n % 10 === 0) await yieldTask(); };
    const wait = async (s) => { for (let t = 0; t < s; t += 1 / 60) await step(); };
    const until = async (cond, max = 8) => { let t = 0; while (!cond() && t < max) { await step(); t += 1 / 60; } return cond(); };
    const stick = async (dir) => { await step(f({}, dir === 'r' ? 1 : dir === 'l' ? -1 : 0, dir === 'd' ? 1 : dir === 'u' ? -1 : 0)); await wait(0.2); };
    const press = async (b = 'hop') => { await step(f({ [b]: true })); await wait(0.25); };
    /** Keys a code by walking the cursor over the 4 x 3 keypad from where it is. */
    const KEYS = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['C', '0', 'OK']];
    const key = async (label) => {
      const r = KEYS.findIndex((row) => row.includes(label)), c = KEYS[r].indexOf(label);
      while (it.vending.cursor[0] !== r) await stick(it.vending.cursor[0] < r ? 'd' : 'u');
      while (it.vending.cursor[1] !== c) await stick(it.vending.cursor[1] < c ? 'r' : 'l');
      await press();
    };

    // The machines: the photo's model, one merged mesh per material, with the lit shelves inside.
    out.machines = it.machines.length;
    const vm = it.machines[0], group = vm.group;
    const meshes = []; group.traverse((o) => { if (o.isMesh) meshes.push(o); });
    const names = new Set(meshes.map((m) => m.material.name));
    out.parts = ['vending goods', 'vending coil', 'vending rails', 'vending door glass', 'vending push flap', 'vending key legends'].filter((n) => names.has(n));
    out.drawCalls = meshes.length;
    const goods = meshes.find((m) => m.material.name === 'vending goods');
    out.goodsTris = goods.geometry.getAttribute('position').count / 3;
    // Level of detail: every product within reach, a painted card from across the park.
    vm.lod(vm.base.clone().add(new V(60, 0, 0))); out.farGoods = goods.visible;
    vm.lod(vm.base.clone().add(new V(2, 0, 0))); out.nearGoods = goods.visible;

    // Walk up and use it.
    sim.walking = true;
    const item = it.items.find((i) => i.interactionType === 'vending' && i.position.distanceTo(vm.base) < 0.01);
    item.action(sim);
    out.started = !!it.vending;
    const stand = it.vending.stand;
    out.standing = { dist: +Math.hypot(sim.position.x - stand.at.x, sim.position.z - stand.at.z).toFixed(3), facing: +Math.cos(sim.yaw - stand.yaw).toFixed(3) };
    await wait(0.5);
    out.hintKeypad = it.vending.hint();
    // A code that is not on the shelves.
    await key('7'); await key('7');
    out.invalid = it.vending.slot;
    // 52: row 5, column 2.
    await key('5'); await key('2');
    out.slot = it.vending.slot && { code: it.vending.slot.code, kind: it.vending.slot.kind, price: it.vending.slot.price };
    // C clears it; key it again.
    await key('C'); out.cleared = it.vending.slot;
    await key('5'); await key('2');

    // No Coins: declined, and the phone asks to add funds (not yet offered).
    const wallet = () => g.profile.wallet.credit + g.profile.wallet.testCredit;
    g.profile.wallet.credit = 0; g.profile.wallet.testCredit = 0;
    localStorage.setItem('lazer-profile-v1', JSON.stringify(g.profile));
    out.before = wallet();
    await press('pushDeck');
    out.phoneOut = await until(() => it.vending.tapRaise >= 1, 2);
    out.declined = await until(() => it.vending.phase === 'keypad' && g.phone.active, 6);
    const view = g.phone.view, page = view?.page();
    const rows = page?.blocks.find((b) => b.type === 'list')?.rows ?? [];
    out.sheet = { title: view?.title, sub: page?.blocks[0]?.sub, addFunds: rows[0] && { label: rows[0].label, disabled: !!rows[0].disabled } };
    out.afterDecline = wallet();
    g.phone.stow();

    // With Coins: the beep, the coil, the drop, the flap, the hand.
    await g.economy.reward('vending-test-' + Date.now(), 250 * 10);
    const pockets = () => g.profile.pockets.entries.length;
    out.funded = wallet();
    const goodsBefore = goods.geometry.getAttribute('position').count;
    const buy = async () => {
      const got = {};
      await key('5'); await key('2');
      await press('pushDeck');
      got.approved = await until(() => it.vending.phase === 'result', 6);
      got.vending = await until(() => it.vending.phase === 'vending', 4);
      got.fell = await until(() => vm.dropState === 'falling', 3);
      got.landed = await until(() => it.vending.phase === 'collect', 3);
      got.pockets = pockets();
      await press('hop');
      got.flapOpen = +vm.group.userData.pivot.children.find((c) => c.isGroup && c.children[0]?.material?.name === 'vending push flap').rotation.x.toFixed(2);
      got.back = await until(() => it.vending.phase === 'keypad', 3);
      got.taken = pockets() - got.pockets;
      got.held = g.profile.pockets.entries.find((i) => i.id === g.profile.pockets.held)?.kind;
      return got;
    };
    const p0 = pockets();
    out.first = await buy();
    out.afterFirst = wallet();
    out.second = await buy();
    out.afterSecond = wallet();
    out.pocketsGained = pockets() - p0;
    out.stockKept = goods.geometry.getAttribute('position').count === goodsBefore && goods.visible;

    // B walks away: the controls come back.
    await press('brakeBars');
    out.ended = !it.vending;
    const x0 = sim.position.x, z0 = sim.position.z;
    for (let i = 0; i < 40; i++) { it.update(sim, f({}, 0, -1), 1 / 60); g.advance(1 / 60, { lean: -1 }, false); }
    out.walked = +Math.hypot(sim.position.x - x0, sim.position.z - z0).toFixed(2);
    return out;
  });
  check('Every Veterans machine is the new glass-front machine', r.machines >= 2 && r.parts.length === 6, { machines: r.machines, parts: r.parts });
  check('Merged per material: a handful of draws per machine', r.drawCalls <= 30, { drawCalls: r.drawCalls, goodsTris: r.goodsTris });
  check('Products are drawn in detail only up close', r.nearGoods && !r.farGoods, { near: r.nearGoods, far: r.farGoods });
  check('Stepping up stands the rider at the column, facing the machine', r.started && r.standing.dist < 0.05 && r.standing.facing > 0.99, r.standing);
  check('The keypad says how to key a code', /Press key/.test(r.hintKeypad), r.hintKeypad);
  check('A code not on the shelves selects nothing', r.invalid === null);
  check('Keying 5 then 2 selects coil 52 with its price in Coins', r.slot?.code === '52' && r.slot.price > 0, r.slot);
  check('C clears the selection', r.cleared === null);
  check('X holds the phone out to the reader', r.phoneOut);
  check('With no Coins the payment is declined and the phone asks to add funds', r.declined && r.sheet.title === 'DECLINED' && /add funds/i.test(r.sheet.sub ?? '') && r.sheet.addFunds?.disabled, r.sheet);
  check('A declined payment charges nothing', r.afterDecline === r.before, { before: r.before, after: r.afterDecline });
  check('Paid: approved, the coil turns, the product falls and lands in the bin', ['approved', 'vending', 'fell', 'landed'].every((k) => r.first[k] && r.second[k]), { first: r.first, second: r.second });
  check('Each sale takes its price in Coins', r.funded - r.afterFirst === r.slot.price && r.afterFirst - r.afterSecond === r.slot.price, { funded: r.funded, afterFirst: r.afterFirst, afterSecond: r.afterSecond });
  check('A pushes the flap in and the product goes into the pockets and the hand', r.first.flapOpen > 0.3 && r.first.taken === 1 && r.first.held === 'Soda' && r.pocketsGained === 2, { first: r.first, gained: r.pocketsGained });
  check('The shelves never run out', r.stockKept);
  check('B walks away and the rider moves again', r.ended && r.walked > 0.3, { ended: r.ended, walked: r.walked });
  check('No page errors', errors.length === 0, errors.slice(0, 3));
} finally {
  await browser.close();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
