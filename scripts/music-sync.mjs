// Sesh Music catalog sync.
//
//   npm run music:sync
//
// Scans public/music/tracks for audio files and public/music/covers for
// optional cover art, applies optional overrides from content/music/metadata.json,
// and writes public/music/catalog.json for the browser. Runs automatically before
// `npm run dev` and `npm run build`. See docs/MUSIC_SETUP.md.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const tracksDir = join(root, 'public', 'music', 'tracks');
const coversDir = join(root, 'public', 'music', 'covers');
const catalogFile = join(root, 'public', 'music', 'catalog.json');
const metadataFile = join(root, 'content', 'music', 'metadata.json');
const AUDIO = new Set(['.mp3', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.wav', '.flac', '.webm']);
const COVER = ['.jpg', '.jpeg', '.png', '.webp'];

for (const dir of [tracksDir, coversDir]) mkdirSync(dir, { recursive: true });

const problems = [];
let overrides = {};
if (existsSync(metadataFile)) {
  try {
    const parsed = JSON.parse(readFileSync(metadataFile, 'utf8'));
    overrides = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed.tracks ?? parsed : {};
  } catch (error) {
    problems.push(`content/music/metadata.json is not valid JSON (${error.message}); ignoring overrides.`);
  }
}

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = join(dir, entry.name);
  if (entry.name.startsWith('.')) return [];
  return entry.isDirectory() ? walk(full) : [full];
});
// URL path for a file inside public/, each segment encoded so spaces, Unicode,
// '#', '?' and '%' in file names survive.
const url = (full) => '/' + relative(join(root, 'public'), full).split(sep).map(encodeURIComponent).join('/');
const inside = (full, dir) => { const rel = relative(dir, resolve(full)); return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel); };
const slug = (text) => text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'track';
const text = (value, limit = 200) => typeof value === 'string' ? value.replace(/[\u0000-\u001f]/g, '').trim().slice(0, limit) : undefined;

const files = walk(tracksDir).filter((f) => AUDIO.has(extname(f).toLowerCase())).sort((a, b) => relative(tracksDir, a).localeCompare(relative(tracksDir, b)));
const skipped = walk(tracksDir).filter((f) => !AUDIO.has(extname(f).toLowerCase()) && basename(f) !== '.gitkeep');
for (const f of skipped) problems.push(`Skipped unsupported file: ${relative(root, f)}`);

const tracks = [];
const ids = new Map();
files.forEach((full, index) => {
  const name = relative(tracksDir, full).split(sep).join('/');
  // Some static servers (including Vite's dev server) cannot serve these.
  if (/[#?%]/.test(name)) { problems.push(`Left out ${name}: rename it without #, ? or % so every host can serve it.`); return; }
  const stem = basename(full, extname(full));
  const meta = overrides[name] ?? overrides[basename(full)] ?? {};
  // "Artist Name - Track Title" when the file follows the convention.
  const dash = stem.indexOf(' - ');
  const fileArtist = dash > 0 ? stem.slice(0, dash).trim() : '';
  const fileTitle = dash > 0 ? stem.slice(dash + 3).trim() : stem.trim();
  const id = text(meta.id, 80) ? slug(meta.id) : slug(stem);
  let cover;
  if (text(meta.cover)) {
    const candidate = resolve(coversDir, meta.cover);
    if (inside(candidate, coversDir) && existsSync(candidate)) cover = url(candidate);
    else problems.push(`Cover "${meta.cover}" for ${name} is missing or outside public/music/covers; using the default cover.`);
  } else {
    const match = COVER.map((ext) => join(coversDir, stem + ext)).find((p) => existsSync(p));
    if (match) cover = url(match);
  }
  const entry = {
    id,
    title: text(meta.title) || fileTitle,
    artist: text(meta.artist) || fileArtist || 'Unknown artist',
    file: url(full),
    ...(cover ? { cover } : {}),
    ...(text(meta.credit, 400) ? { credit: text(meta.credit, 400) } : {}),
    order: Number.isFinite(meta.order) ? meta.order : 1000 + index,
    bytes: statSync(full).size,
  };
  if (ids.has(id)) problems.push(`Duplicate track id "${id}": ${ids.get(id)} and ${name}. Give one of them an explicit "id" in content/music/metadata.json. The second file was left out.`);
  else { ids.set(id, name); tracks.push(entry); }
});
tracks.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));

const catalog = { version: 1, tracks };
const next = JSON.stringify(catalog, null, 2) + '\n';
const previous = existsSync(catalogFile) ? readFileSync(catalogFile, 'utf8') : '';
if (next !== previous) writeFileSync(catalogFile, next);
for (const p of problems) console.warn('[music:sync] ' + p);
console.log(`[music:sync] ${tracks.length} track${tracks.length === 1 ? '' : 's'} in public/music/catalog.json${next === previous ? ' (unchanged)' : ''}`);
