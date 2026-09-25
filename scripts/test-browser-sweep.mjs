// Windows local browser pass: node scripts/test-browser-sweep.mjs [suite-name ...]
// LAZER_URL and BROWSER_EXECUTABLE select the running game and Chrome.
import { spawn } from 'node:child_process';
import { readdir, readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dir = join(root, 'tests'), out = join(root, 'artifacts/regression');
const url = process.env.LAZER_URL || 'http://127.0.0.1:5184';
const chrome = process.env.BROWSER_EXECUTABLE || process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
await mkdir(out, { recursive: true });
const selected = new Set(process.argv.slice(2).map((s) => s.endsWith('.browser.mjs') ? s : `${s}.browser.mjs`));
const files = (await readdir(dir)).filter((f) => f.endsWith('.browser.mjs') && (!selected.size || selected.has(f))).sort();
if (!files.length) throw new Error('No matching browser suites');
const probe = await chromium.launch({ executablePath: chrome, headless: true });
try {
  const page = await probe.newPage();
  const renderer = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null;
  });
  console.log(`WebGL renderer: ${renderer ?? 'unavailable'}`);
  if (!renderer || /SwiftShader|Software/i.test(renderer)) throw new Error('Hardware WebGL renderer could not be verified');
} finally { await probe.close(); }
const results = [];
let next = 0;
async function worker() {
  for (;;) {
    const index = next++;
    if (index >= files.length) return;
    const file = files[index], original = join(dir, file), temp = join(dir, file.replace('.browser.mjs', '.browser-run.tmp.mjs'));
    let source = await readFile(original, 'utf8');
    source = source.replaceAll(/http:\/\/127\.0\.0\.1:(?:5173|5174|5177|5180|5182|5183|5186|5190|5195)/g, url);
    source = source.replaceAll(/['"]--use-angle=swiftshader['"],?\s*/g, '').replaceAll(/['"]--enable-unsafe-swiftshader['"],?\s*/g, '');
    await writeFile(temp, source);
    const started = Date.now();
    let output = '', timedOut = false;
    try {
      const child = spawn(process.execPath, [temp], { cwd: root, env: { ...process.env, LAZER_URL: url, BROWSER_EXECUTABLE: chrome, CHROME_PATH: chrome, OUT: `artifacts/regression/${file.replace('.browser.mjs', '')}` }, stdio: ['ignore', 'pipe', 'pipe'] });
      child.stdout.on('data', (c) => { output += c; });
      child.stderr.on('data', (c) => { output += c; });
      const timer = setTimeout(() => { timedOut = true; child.kill(); }, 65000);
      const code = await new Promise((resolve, reject) => { child.on('exit', resolve); child.on('error', reject); });
      clearTimeout(timer);
      const row = { file, status: timedOut ? 'timeout' : code === 0 ? 'pass' : 'fail', seconds: Math.round((Date.now() - started) / 1000), exitCode: code };
      results.push(row);
      await writeFile(join(out, `${file}.log`), output);
      console.log(`${results.length}/${files.length} ${row.status.toUpperCase()} ${file} ${row.seconds}s`);
    } finally { await unlink(temp).catch(() => {}); }
  }
}
const workers = Math.max(1, Math.min(2, Number(process.env.BROWSER_WORKERS) || 1));
await Promise.all(Array.from({ length: workers }, () => worker()));
await writeFile(join(out, process.env.SWEEP_SUMMARY || 'summary.json'), JSON.stringify(results.sort((a, b) => a.file.localeCompare(b.file)), null, 2));
if (results.some((r) => r.status !== 'pass')) process.exitCode = 1;
