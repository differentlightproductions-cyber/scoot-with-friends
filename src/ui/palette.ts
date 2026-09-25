export const UI_PALETTES = ['default', 'grayscale', 'earth'] as const;
export type UiPalette = typeof UI_PALETTES[number];
const palettes = {
  default: {ink:'#0b0c0d',paper:'#f4f1e8',lime:'#c6ff00',orange:'#ff5a1f',teal:'#1ecbe1',pink:'#ff4fa3',sun:'#ffd23f'},
  // Accents step through light, mid and dark so a selection, a highlight or an accent word on paper
  // still stands out without hue: lime (the selection, ink text on it) is a clear mid tone, orange
  // (accent text and drop shadows) dark enough to read on paper.
  grayscale: {ink:'#141414',paper:'#efefef',lime:'#a9a9a9',orange:'#555555',teal:'#8c8c8c',pink:'#9e9e9e',sun:'#cfcfcf'},
  earth: {ink:'#29261f',paper:'#eee7da',lime:'#a9b27a',orange:'#8f5230',teal:'#8fa892',pink:'#b98f84',sun:'#d4bd8a'},
};
let current: UiPalette = 'default';
export const isUiPalette = (value:unknown):value is UiPalette => UI_PALETTES.includes(value as UiPalette);
export const uiColors = () => palettes[current];
/** Interface colors only: no filters on the world, rider or merchandise previews. */
export function applyUiPalette(value:UiPalette) {
  current = isUiPalette(value) ? value : 'default';
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.uiPalette = current;
  for (const [key,color] of Object.entries(uiColors())) document.documentElement.style.setProperty('--'+key,color);
  window.dispatchEvent(new Event('swf-palette-change'));
}
