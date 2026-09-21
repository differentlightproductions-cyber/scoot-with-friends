import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const folder = 'artifacts/ramp-review';
mkdirSync(folder, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
const ids = process.env.QUARTERS_ONLY ? ['front-quarter','back-quarter'] : ['front-quarter','back-quarter','small-box','large-box','wood-hub','spine'];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if(message.type()==='error') errors.push(message.text()); });
try {
  await page.goto((process.env.LAZER_URL || 'http://127.0.0.1:5186') + '/?map=outdoor');
  await page.waitForFunction(() => window.__LAZER, null, { timeout: 90000 });
  await page.evaluate(async () => { const g = window.__LAZER; g.testing(true); await g.startSession('outdoor', true); g.advance(.1, {}, false); });
  await page.waitForFunction(ids => ids.every(id => window.__LAZER.park.scene.getObjectByName('Detailed ' + id)), ids, { timeout: 90000 });
  const surfaces = await page.evaluate(async (ids) => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { modules, profile } = await import('/src/park/outdoor.ts');
    const scene = window.__LAZER.park.scene;
    scene.updateMatrixWorld(true);
    const results = [];
    for (const id of ids) {
      const m = id==='wood-hub' ? {x0:-.01,x1:.61,z0:-6.5,z1:6.2,kind:'hub'} : modules.find(m => m.id === (id==='large-box'?'large-transfer':id)), model = scene.getObjectByName('Detailed ' + id);
      const rows = [];
      for (const fx of [.2, .5, .8]) for (let i = 1; i < 24; i++) {
        const x = m.x0 + (m.x1-m.x0)*fx, z = m.z0 + (m.z1-m.z0)*i/24;
        // Exclude rear safety rail, retaining all transition and crest samples.
        if (m.kind === 'quarter' && (m.reverse ? z < m.z0+.5 : z > m.z1-.5)) continue;
        const ray = new THREE.Raycaster(new THREE.Vector3(x, 10, z), new THREE.Vector3(0,-1,0));
        const hit = ray.intersectObject(model, true)[0];
        const expected = id==='wood-hub' ? (z<1 ? .48+(z+6.5)/7.5*1.34 : z<2.75 ? 1.82 : 1.82-(z-2.75)/3.45*1.4) : profile(m,z);
        rows.push({ x, z, expected, actual: hit?.point.y ?? null, error: hit ? hit.point.y-expected : null });
      }
      const missing = rows.filter(r=>r.actual===null).length;
      const maxError = Math.max(...rows.filter(r=>r.error!==null).map(r=>Math.abs(r.error)));
      results.push({ id, missing, maxError, rows });
    }
    return results;
  }, ids);
  writeFileSync(`${folder}/surface-report.json`,JSON.stringify({surfaces,errors},null,2));
  for (const [name, eye, target] of (process.env.NO_IMAGES ? [] : [
    ['back-quarter-front',[22,12,9],[0,2,26]],
    ['front-quarter-front',[-22,12,-9],[0,2,-26]],
    ['back-quarter-side',[20,6,27],[0,2,26]],
    ['middle-assembly',[16,12,15],[-2,1,0]],
    ['small-box-close',[-8,4,9],[-1.5,.7,0]],
    ['spine-close',[10,4,7],[4.5,.9,0]],

  ])) {
    const shot = await page.evaluate(({eye,target})=>{ const g=window.__LAZER,cam=g.camera.camera; cam.position.set(...eye);cam.lookAt(...target);cam.updateProjectionMatrix();g.renderer.render(g.park.scene,cam); return g.renderer.domElement.toDataURL('image/png'); },{eye,target});
    writeFileSync(`${folder}/${name}.png`,Buffer.from(shot.split(',')[1],'base64'));
  }
  const result = { surfaces, errors, environment: 'Headless Windows Chrome, SwiftShader; not hardware/device performance testing' };
  writeFileSync(`${folder}/surface-report.json`,JSON.stringify(result,null,2));
  for(const s of surfaces) console.log(`${s.id}: missing ${s.missing}, max surface error ${s.maxError.toFixed(3)}m`);
  if(errors.length || surfaces.some(s=>s.missing || s.maxError>.1)) process.exitCode=1;
} finally { await browser.close(); }
