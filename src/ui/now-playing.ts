import type { MusicService } from '../audio/music';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * Now Playing, read from the one MusicService: a compact player at the top of
 * the Sesh (pause) menu (title, artist, progress, previous / play-pause / next)
 * and a small chip in the riding HUD's bottom-right corner, shown only while a
 * track is actually playing and nothing else owns the screen.
 */
export class NowPlaying {
  readonly chip: HTMLDivElement;
  private key = '';
  private chipShown = false;

  constructor(private music: MusicService, hudRoot: HTMLElement, private player: HTMLElement) {
    this.chip = document.createElement('div');
    this.chip.id = 'now-playing';
    this.chip.hidden = true;
    this.chip.setAttribute('aria-live', 'polite');
    this.chip.innerHTML = '<i aria-hidden="true">♪</i><span><b></b><small></small></span><u><s></s></u>';
    hudRoot.append(this.chip);
  }

  /** Call every frame; `chipAllowed` is false over menus, the phone, loading, shops and the creator. */
  update(chipAllowed: boolean) {
    const m = this.music, track = m.current, playing = m.status === 'playing';
    const key = (track?.id ?? '') + '|' + m.status;
    if (key !== this.key) {
      this.key = key;
      const title = track?.title ?? 'Nothing playing', artist = track?.artist ?? 'Press play for Sesh Music';
      this.player.querySelector('.np-title')!.textContent = title;
      this.player.querySelector('.np-artist')!.textContent = artist;
      const toggle = this.player.querySelector<HTMLButtonElement>('[data-action="music-toggle"]')!;
      toggle.textContent = playing || m.status === 'loading' ? '❚❚' : '▶';
      toggle.setAttribute('aria-label', playing ? 'Pause' : 'Play');
      this.player.classList.toggle('np-live', playing);
      if (track) {
        this.chip.querySelector('b')!.innerHTML = esc(track.title);
        this.chip.querySelector('small')!.innerHTML = esc(track.artist);
      }
    }
    const progress = m.duration > 0 ? Math.min(1, m.position / m.duration) : 0;
    this.player.style.setProperty('--np-progress', progress.toFixed(4));
    const show = chipAllowed && playing && !!track;
    if (show !== this.chipShown) { this.chipShown = show; this.chip.hidden = !show; }
    if (show) this.chip.style.setProperty('--np-progress', progress.toFixed(4));
  }
}
