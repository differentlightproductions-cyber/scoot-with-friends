export const UI_PALETTES = ['default', 'grayscale', 'earth'] as const;
export type UiPalette = typeof UI_PALETTES[number];
const palettes = {
  default: {ink:'#0b0c0d',paper:'#f4f1e8',lime:'#c6ff00',orange:'#ff5a1f',teal:'#1ecbe1',pink:'#ff4fa3',sun:'#ffd23f'},
  grayscale: {ink:'#141414',paper:'#efefef',lime:'#d6d6d6',orange:'#b6b6b6',teal:'#cccccc',pink:'#c2c2c2',sun:'#e1e1e1'},
  earth: {ink:'#29261f',paper:'#eee7da',lime:'#bec39b',orange:'#c7946e',teal:'#a2b7a4',pink:'#c4a39a',sun:'#d4bd8a'},
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
