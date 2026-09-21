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
  const results = await page.evaluate(async (firstOnly) => {
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
    for (const track of firstOnly ? tracks.slice(0, 1) : tracks) {
      // Same fully buffered source used by MusicPlayer on hosts without Range.
      const response = await fetch(track.file);
      if (!response.ok) throw new Error(`Track download failed: ${response.status}`);
      const source = URL.createObjectURL(await response.blob());
      const audio = new Audio(source);
      let stage = 'play';
      try {
        let playTimeout;
        try {
          await Promise.race([
            audio.play(),
            new Promise((_, reject) => { playTimeout = setTimeout(() => reject(new Error('Playback start timeout')), 10000); }),
          ]);
        } finally { clearTimeout(playTimeout); }
        stage = 'progress';
        await wait(audio, () => Number.isFinite(audio.duration) && audio.currentTime > 0.1);
        const destination = audio.duration / 2;
        stage = 'seek'; audio.currentTime = destination;
        await wait(audio, () => !audio.seeking && Math.abs(audio.currentTime - destination) < 2);
        results.push({ title: track.title, seconds: audio.duration, decoded: true, seeked: true });
      } catch (error) {
        results.push({ title: track.title, error: String(error), stage, duration: String(audio.duration), position: audio.currentTime, seeking: audio.seeking, readyState: audio.readyState, paused: audio.paused });
      } finally { audio.pause(); audio.removeAttribute('src'); audio.load(); URL.revokeObjectURL(source); }
    }
    return results;
  }, process.env.MUSIC_FIRST_ONLY === '1');
  mkdirSync('artifacts/music', { recursive: true });
  writeFileSync('artifacts/music/stream-check.json', JSON.stringify({ base, results }, null, 2));
  for (const result of results) console.log(`${result.error ? 'FAIL' : 'PASS'} ${result.title}${result.error ? ': ' + result.error : ' — playback and seeking'}`);
  if (!results.length || results.some(result => result.error)) process.exitCode = 1;
} finally { await browser.close(); }
