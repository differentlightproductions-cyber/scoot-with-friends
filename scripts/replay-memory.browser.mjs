// Retained replay-buffer bytes at 60, 120 and 180 simulated seconds.
import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  page.setDefaultTimeout(90000);
  await page.goto((process.env.LAZER_URL || 'http://127.0.0.1:5184') + '/?map=outdoor');
  await page.waitForFunction(() => window.__LAZER?.replayBuffer);
  console.log('Renderer:', await page.evaluate(() => { const gl = window.__LAZER.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); }));
  const result = await page.evaluate(async () => {
    const g = window.__LAZER;
    g.testing(true);
    await g.startSession('outdoor', true);
    g.profile.settings.replayHistory = 60;
    const original = g.renderer.render;
    g.renderer.render = () => {};
    const readings = [];
    const t0 = performance.now();
    for (let second = 1; second <= 180; second++) {
      for (let i = 0; i < 30; i++) g.advance(1 / 30, {}, true);
      if ([60, 120, 180].includes(second)) readings.push({ second, bytes: g.replayBuffer.bytes, samples: g.replayBuffer.samples.length, duration: g.replayBuffer.duration });
    }
    g.renderer.render = original;
    return { readings, elapsedMs: performance.now() - t0 };
  });
  console.log(JSON.stringify(result));
} finally { await browser.close(); }
