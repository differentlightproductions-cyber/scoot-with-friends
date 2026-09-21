// Verify the actual hosted tracks decode, play and seek. This checks browser
// media state, not physical speakers. Never requires owner credentials.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const base = process.env.MUSIC_BASE_URL;
if (!base) throw new Error('Set MUSIC_BASE_URL to the site being tested.');
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-device-for-media-stream'],
});
try {
  const page = await browser.newPage();
  await page.goto(new URL('/music/catalog.json', base).href);
  const results = await page.evaluate(async () => {
    const { tracks } = await (await fetch('/music/catalog.json')).json();
    const results = [];
    const wait = (audio, predicate) => new Promise((resolve, reject) => {
      const started = performance.now();
      const timer = setInterval(() => {
        if (audio.error || performance.now() - started > 20000) {
          clearInterval(timer); reject(new Error(audio.error?.message || 'Media timeout'));
        } else if (predicate()) { clearInterval(timer); resolve(); }
      }, 50);
    });
    for (const track of tracks) {
      const audio = new Audio(track.file);
      try {
        await audio.play();
        await wait(audio, () => Number.isFinite(audio.duration) && audio.currentTime > 0.1);
        const destination = audio.duration / 2;
        audio.currentTime = destination;
        await wait(audio, () => !audio.seeking && Math.abs(audio.currentTime - destination) < 2);
        results.push({ title: track.title, seconds: audio.duration, decoded: true, seeked: true });
      } catch (error) {
        results.push({ title: track.title, error: String(error) });
      } finally { audio.pause(); audio.removeAttribute('src'); audio.load(); }
    }
    return results;
  });
  mkdirSync('artifacts/music', { recursive: true });
  writeFileSync('artifacts/music/stream-check.json', JSON.stringify({ base, results }, null, 2));
  for (const result of results) console.log(`${result.error ? 'FAIL' : 'PASS'} ${result.title}${result.error ? ': ' + result.error : ' — playback and seeking'}`);
  if (!results.length || results.some(result => result.error)) process.exitCode = 1;
} finally { await browser.close(); }
