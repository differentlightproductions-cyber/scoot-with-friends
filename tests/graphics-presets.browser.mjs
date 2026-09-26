// Graphics presets (#28 audit): Low, Medium and High set through the Settings
// menu's own path, on the same scene from the same camera, change the real
// renderer state (resolution, shadow filter and map size, textures, plant and
// rock density) and the frame cost, and the chosen preset survives a reload and a
// map change. The camera filter setting is separate and never moves with it.
//   LAZER_URL=http://127.0.0.1:5195 BROWSER_EXECUTABLE=... node tests/graphics-presets.browser.mjs
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || process.env.CHROME_PATH, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const results = [];
const check = (label, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${label} ${JSON.stringify(detail)}`); };
try {
  const page = await browser.newPage({ viewport: { width: 480, height: 300 } }), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const base = process.env.LAZER_URL || 'http://127.0.0.1:5186';
  await page.goto(base + '/?map=outdoor');
  await page.waitForFunction(() => window.__LAZER?.startSession, null, { timeout: 900000 });
  // What the renderer is really doing right now, read off three.js itself.
  const state = () => page.evaluate(() => {
    const g = window.__LAZER, r = g.renderer, scene = g.fidelity.scene;
    g.render(); // one frame, so the distance LOD (#98) has repacked for the preset
    let sun = null, scatter = 0, scatterFull = 0, drawn = 0, bump = 0, rough = 0, aniso = new Set();
    scene.traverse((o) => {
      if (o.isDirectionalLight && o.castShadow && !sun) sun = o.shadow.mapSize.x;
      // Scenery thins by preset (density); distance LOD (#98) then draws the share of those in range.
      if (o.isInstancedMesh && o.userData.scatterCount) { const lod = o.userData.instanceLod; scatter += lod ? Math.max(1, Math.round(lod.total * lod.density)) : o.count; scatterFull += o.userData.scatterCount; drawn += o.count; }
      if (o.isMesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (!m?.isMeshStandardMaterial) continue;
        if (m.bumpMap) bump++;
        if (m.roughnessMap) rough++;
        if (m.map) aniso.add(m.map.anisotropy);
      }
    });
    const chunks = scene.userData.detailChunks;
    return {
      preset: g.profile.settings.fidelity, applied: scene.userData.fidelity, pixelRatio: r.getPixelRatio(),
      shadowFilter: r.shadowMap.type === 2 ? 'PCFSoft' : r.shadowMap.type === 1 ? 'PCF' : String(r.shadowMap.type), sunShadowMap: sun,
      scatter, scatterFull, drawn, bumpMaps: bump, roughnessMaps: rough, anisotropy: [...aniso].sort((a, b) => a - b),
      detailChunksShown: chunks ? chunks.filter((c) => c.meshes[0]?.visible).length + '/' + chunks.length : null,
      cameraFilter: g.profile.settings.cameraFilter, filterStrength: g.profile.settings.filterStrength,
    };
  });
  // Choose a preset exactly as the Settings row does (save, then apply).
  const choose = (preset) => page.evaluate((preset) => { const g = window.__LAZER; g.profile.settings.fidelity = preset; g.menu.changed(); }, preset);
  // The same place, the same camera: a fresh reset, then a few real frames timed.
  const frame = () => page.evaluate(() => {
    const g = window.__LAZER, s = g.sim;
    s.reset(0, true); g.advance(0.5, {}, false); g.camera.view = 'third';
    g.render(); g.render();
    const info = g.renderer.info.render, calls = info.calls, triangles = info.triangles;
    // Read one pixel back after each frame so the time includes the GPU's work.
    const gl = g.renderer.getContext(), px = new Uint8Array(4), sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    sync(); const t0 = performance.now(); for (let i = 0; i < 3; i++) { g.render(); sync(); } const ms = (performance.now() - t0) / 3;
    return { calls, triangles, ms: Math.round(ms), camera: g.camera.camera.position.toArray().map((v) => +v.toFixed(2)) };
  });
  await page.evaluate(async () => {
    const g = window.__LAZER; g.testing(true); await g.startSession('outdoor', true);
    // A distinctive camera filter choice, to see that presets never touch it.
    g.profile.settings.cameraFilter = 'off'; g.profile.settings.filterStrength = 37; g.menu.changed();
  });
  const rows = {};
  for (const preset of ['low', 'medium', 'high']) {
    await choose(preset);
    rows[preset] = { ...(await state()), ...(await frame()) };
    console.log(preset.toUpperCase(), JSON.stringify(rows[preset]));
  }
  const { low, medium, high } = rows;
  check('Each preset is applied to the scene', low.applied === 'low' && medium.applied === 'medium' && high.applied === 'high');
  check('Same camera for all three', JSON.stringify(low.camera) === JSON.stringify(medium.camera) && JSON.stringify(medium.camera) === JSON.stringify(high.camera), low.camera);
  check('Resolution: Low < Medium < High', low.pixelRatio < medium.pixelRatio && medium.pixelRatio < high.pixelRatio, [low.pixelRatio, medium.pixelRatio, high.pixelRatio]);
  check('Sun shadow map: 512 / 1024 / 2048, soft filter only on High', low.sunShadowMap === 512 && medium.sunShadowMap === 1024 && high.sunShadowMap === 2048 && high.shadowFilter === 'PCFSoft' && medium.shadowFilter === 'PCF', [low.sunShadowMap, medium.sunShadowMap, high.sunShadowMap, low.shadowFilter, medium.shadowFilter, high.shadowFilter]);
  check('Plants and rocks: Low < Medium < High (High draws all of them)', low.scatter < medium.scatter && medium.scatter < high.scatter && high.scatter === high.scatterFull, [low.scatter, medium.scatter, high.scatter, high.scatterFull]);
  check('Distance LOD (#98): scenery out of range is not drawn, what is near is', high.drawn > 0 && high.drawn < high.scatter && low.drawn <= medium.drawn && medium.drawn <= high.drawn, [low.drawn, medium.drawn, high.drawn, high.scatter]);
  check('Low drops bump and roughness maps, Medium and High keep them', low.bumpMaps === 0 && low.roughnessMaps === 0 && medium.bumpMaps > 0 && high.bumpMaps === medium.bumpMaps && high.roughnessMaps === medium.roughnessMaps, [low.bumpMaps, medium.bumpMaps, high.bumpMaps]);
  check('Texture filtering: High sharper than Low and Medium', Math.max(...high.anisotropy) > Math.max(...medium.anisotropy) && JSON.stringify(low.anisotropy) === JSON.stringify(medium.anisotropy), [low.anisotropy, medium.anisotropy, high.anisotropy]);
  check('Low draws fewer triangles than High', low.triangles < high.triangles, [low.triangles, medium.triangles, high.triangles]);
  check('Frame cost: Low cheaper than High', low.ms < high.ms, [low.ms, medium.ms, high.ms]);
  check('The camera filter setting never moves with the preset', [low, medium, high].every((r) => r.cameraFilter === 'off' && r.filterStrength === 37));
  // Persistence: Low, then a reload.
  await choose('low');
  await page.goto(base + '/?map=outdoor');
  await page.waitForFunction(() => window.__LAZER?.startSession, null, { timeout: 900000 });
  await page.evaluate(async () => { const g = window.__LAZER; g.testing(true); await g.startSession('outdoor', true); });
  const reloaded = await state();
  check('After a reload: still Low, applied (resolution and shadow map)', reloaded.preset === 'low' && reloaded.applied === 'low' && reloaded.pixelRatio === low.pixelRatio && reloaded.sunShadowMap === 512 && reloaded.scatter === low.scatter, reloaded);
  check('After a reload: the camera filter setting is its own', reloaded.filterStrength === 37, reloaded.filterStrength);
  // Map change: B Hill picks up the same preset, with its street detail range.
  await page.evaluate(async () => { const g = window.__LAZER; await g.startSession('b_hill', true); g.sim.reset(0, true); g.advance(0.3, {}, false); g.renderer.render = () => {}; g.render(); });
  const bLow = await state();
  await choose('high');
  await page.evaluate(() => window.__LAZER.render());
  const bHigh = await state();
  check('After a map change: B Hill is Low too', bLow.applied === 'low' && bLow.pixelRatio === low.pixelRatio && bLow.sunShadowMap === 512, bLow);
  check('B Hill street detail reaches further on High than on Low', bLow.detailChunksShown && bHigh.detailChunksShown && +bLow.detailChunksShown.split('/')[0] < +bHigh.detailChunksShown.split('/')[0], [bLow.detailChunksShown, bHigh.detailChunksShown]);
  await choose('medium');
  check('No page errors', errors.length === 0, errors.slice(0, 3));
} finally {
  await browser.close();
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
