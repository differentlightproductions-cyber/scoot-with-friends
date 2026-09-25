// #85: everything is loaded before the loading screen lets go. The first
// frames of riding compile no shaders, upload no textures or meshes; the bar
// follows the real work (asset count, textures, shaders, the view, the map
// photo) and only moves forward.
//   LAZER_URL=http://127.0.0.1:5195 BROWSER_EXECUTABLE=... node tests/loading-warm.browser.mjs
import { chromium } from 'playwright';
const url = process.env.LAZER_URL || 'http://127.0.0.1:5186';
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || process.env.CHROME_PATH, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [];
const check = (label, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${label} ${ok ? '' : JSON.stringify(detail)}`); };
try {
  for (const [map, weather] of [['outdoor', 'sunny'], ['church', 'snow']]) {
    const page = await browser.newPage({ viewport: { width: 640, height: 360 } }), errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${url}/`);
    await page.waitForFunction(() => window.__LAZER?.menu, null, { timeout: 900000 });
    const r = await page.evaluate(async ({ map, weather }) => {
      const g = window.__LAZER, R = g.renderer; g.profile.settings.weather = weather;
      const labels = [], bar = document.querySelector('progress'), label = () => bar?.parentElement?.parentElement?.querySelector('strong')?.textContent ?? document.querySelector('strong')?.textContent;
      const watch = new MutationObserver(() => labels.push([label(), bar?.value])); if (bar) watch.observe(bar.closest('section,div') ?? document.body, { subtree: true, childList: true, characterData: true, attributes: true });
      await g.menu.onRide(map); watch.disconnect();
      const info = () => ({ programs: R.info.programs.length, textures: R.info.memory.textures, geometries: R.info.memory.geometries });
      const atLoad = info();
      await new Promise((res) => { let n = 0; const f = () => { if (++n < 4) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
      // Static batching (render/static-batch.ts): lots merged, interactive props and night lenses intact.
      const scene = g.park.scene, used = new Set(); scene.traverse((o) => { if (o.isMesh) used.add(o.material); });
      const kept = (name) => { const o = scene.getObjectByName(name); let n = 0; o?.traverse((c) => { if (c.isMesh) n++; }); return n; };
      const lenses = [...(scene.userData.lampLenses ?? []), ...(scene.userData.amberLights ?? []).map((a) => a.lens)];
      const batch = { report: scene.userData.staticBatch, vending: kept('Refresh vending machine'), trash: map === 'outdoor' ? kept('Trash can') : 1, lenses: lenses.length, lensesDrawn: lenses.filter((m) => used.has(m)).length };
      return { atLoad, after: info(), labels, batch };
    }, { map, weather });
    check(`${map}: no shader compiles after loading`, r.after.programs === r.atLoad.programs, r);
    check(`${map}: no texture or mesh uploads after loading`, r.after.textures === r.atLoad.textures && r.after.geometries === r.atLoad.geometries, r);
    const values = r.labels.map((l) => l[1]).filter((v) => typeof v === 'number'), text = r.labels.map((l) => l[0]).join(' | ');
    check(`${map}: the bar follows the real stages`, /Loading textures \(\d+\/\d+\)/.test(text) && /Compiling shaders/.test(text) && /Preparing the view \(4\/4\)/.test(text) && /Drawing the map/.test(text), text);
    check(`${map}: the bar only moves forward`, values.every((v, i) => i === 0 || v >= values[i - 1] || v === 10), values);
    check(`${map}: static meshes batched`, r.batch.report?.merged >= (map === 'outdoor' ? 500 : 100) && r.batch.report.batches < r.batch.report.merged / 2, r.batch.report);
    check(`${map}: interactive props left whole (vending, trash cans)`, r.batch.vending > 0 && r.batch.trash > 0, r.batch);
    check(`${map}: every lamp lens still lights a mesh at night`, r.batch.lensesDrawn === r.batch.lenses, r.batch);
    check(`${map}: no page errors`, errors.length === 0, errors);
    await page.close();
  }
} finally {
  await browser.close();
}
const failed = results.filter((ok) => !ok).length;
console.log(`${results.length - failed}/${results.length} loading checks passed`);
process.exit(failed ? 1 : 0);
