import { uiSound } from '../audio/audio';
import { emptyInput, type InputFrame } from '../input/input';
import { t } from '../i18n';
import { canRecord, fileName, saveToDevice, videoExtension, videoMime } from '../render/video';

/**
 * The phone's camera (#77). OPEN CAMERA holds the phone up to the eye: the game
 * view becomes the lens (first person, the phone itself out of shot) with a
 * viewfinder over it. A takes a photo, X starts and stops a clip, LB / RB zoom,
 * Y opens the gallery and B puts the camera down. LS and RS still walk (or
 * ride) and look, so friends can be followed and filmed.
 *
 * A photo or clip is the game image only: the HUD and this viewfinder are HTML
 * above the canvas. Clips carry the world's sound. Everything lives in memory
 * for this session: nothing is written to the browser, so there is no storage
 * limit to reach. SAVE TO DEVICE hands the file to the player (a download, or
 * the share sheet on a phone); closing or reloading the game empties the gallery.
 */
export interface Shot {
  id: number;
  kind: 'photo' | 'clip';
  name: string;
  blob: Blob;
  /** The first frame, small, for the gallery. */
  thumb: HTMLCanvasElement;
  at: Date;
  /** A clip's length. */
  seconds: number;
  place: string;
  saved: boolean;
}
/** Clips stop themselves at this length (seconds). */
export const MAX_CLIP = 60;
export const MIN_ZOOM = 1, MAX_ZOOM = 4;
const THUMB_WIDTH = 360;

export interface CameraHost {
  canvas: HTMLCanvasElement;
  /** The world's sound for clips, when audio is running. */
  sound: () => MediaStream | null;
  place: () => string;
  /** Puts the camera to the eye (first person) or back (the view the rider had). */
  view: (on: boolean) => void;
  /** Y: open the phone on the gallery. */
  gallery: () => void;
  notify: (title: string, body: string) => void;
}

export class PhoneCamera {
  active = false;
  zoom = 1;
  readonly shots: Shot[] = [];
  readonly root = document.createElement('div');
  /** Called whenever the gallery changes (the phone redraws). */
  onChange = () => {};
  private recording: { recorder: MediaRecorder; stream: MediaStream; chunks: Blob[]; started: number; thumb: HTMLCanvasElement | null; type: string } | null = null;
  private photoPending = false;
  private next = 1;
  private counts = { photo: 0, clip: 0 };
  private readonly rec: HTMLElement;
  private readonly zoomLabel: HTMLElement;
  private readonly flash: HTMLElement;

  constructor(private host: CameraHost) {
    this.root.className = 'phone-camera';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="pc-corners"><i></i><i></i><i></i><i></i></div>
      <div class="pc-rec" hidden><b></b><span>REC 0:00</span></div>
      <div class="pc-zoom">1.0×</div>
      <div class="pc-flash"></div>
      <div class="pc-controls">
        <button type="button" data-cam="gallery" aria-label="Gallery">▦</button>
        <button type="button" data-cam="photo" class="pc-shutter" aria-label="Photo"></button>
        <button type="button" data-cam="record" class="pc-record" aria-label="Record"></button>
        <button type="button" data-cam="done" aria-label="Done">✕</button>
      </div>
      <p class="pc-hint"></p>`;
    this.rec = this.root.querySelector('.pc-rec')!;
    this.zoomLabel = this.root.querySelector('.pc-zoom')!;
    this.flash = this.root.querySelector('.pc-flash')!;
    this.root.addEventListener('click', (e) => {
      const action = (e.target as HTMLElement).closest<HTMLElement>('[data-cam]')?.dataset.cam;
      if (action === 'photo') this.shutter();
      else if (action === 'record') this.toggleRecord();
      else if (action === 'gallery') { this.exit(); this.host.gallery(); }
      else if (action === 'done') this.exit();
    });
    document.body.append(this.root);
  }

  get isRecording() { return !!this.recording; }
  get photos() { return this.shots.filter((s) => s.kind === 'photo').length; }
  get clips() { return this.shots.filter((s) => s.kind === 'clip').length; }

  enter() {
    if (this.active) return;
    this.active = true; this.zoom = 1;
    this.root.hidden = false;
    document.body.classList.add('camera-up');
    this.root.querySelector('.pc-hint')!.textContent = t('camera.hint');
    this.host.view(true);
    this.draw();
  }
  exit() {
    if (!this.active) return;
    if (this.recording) this.stopRecording();
    this.active = false; this.zoom = 1;
    this.root.hidden = true;
    document.body.classList.remove('camera-up');
    this.host.view(false);
  }

  /**
   * One frame of controller input while the camera is up: A, X, Y, B and the
   * bumpers belong to it; the sticks and the brake still reach the rider.
   */
  update(f: InputFrame, dt: number): InputFrame {
    if (f.pressed.hop) this.shutter();
    if (f.pressed.pushDeck) this.toggleRecord();
    if (f.pressed.body) { this.exit(); this.host.gallery(); }
    else if (f.pressed.brakeBars) this.exit();
    const zoom = (f.held.rightModifier ?? 0) - (f.held.leftModifier ?? 0);
    if (zoom) this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * Math.exp(zoom * 1.4 * dt)));
    const out = emptyInput();
    out.steer = f.steer; out.lean = f.lean; out.rx = f.rx; out.ry = f.ry;
    out.held.brake = f.held.brake; out.held.pumpGrind = f.held.pumpGrind;
    out.held.sprint = f.held.sprint; out.pressed.sprint = f.pressed.sprint; out.released.sprint = f.released.sprint;
    this.draw();
    return out;
  }

  /** A: the next rendered frame becomes a photo. */
  shutter() {
    if (!this.active) return;
    this.photoPending = true;
    uiSound('shutter');
    this.flash.classList.remove('on'); void this.flash.offsetWidth; this.flash.classList.add('on');
  }
  toggleRecord() {
    if (!this.active) return;
    if (this.recording) { this.stopRecording(); return; }
    const canvas = this.host.canvas, type = videoMime();
    if (!canRecord(canvas)) { this.host.notify(t('phone.camera'), t('camera.no_video')); return; }
    const stream = canvas.captureStream(30);
    for (const track of this.host.sound()?.getAudioTracks() ?? []) stream.addTrack(track.clone());
    let recorder: MediaRecorder;
    try { recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 6_000_000 }); }
    catch { stream.getTracks().forEach((track) => track.stop()); this.host.notify(t('phone.camera'), t('camera.no_video')); return; }
    const job = { recorder, stream, chunks: [] as Blob[], started: performance.now(), thumb: null as HTMLCanvasElement | null, type: type.split(';')[0] };
    recorder.ondataavailable = (e) => { if (e.data.size) job.chunks.push(e.data); };
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(job.chunks, { type: job.type });
      const seconds = Math.min(MAX_CLIP, (performance.now() - job.started) / 1000);
      if (blob.size && job.thumb) this.add('clip', blob, job.thumb, seconds);
    };
    recorder.start(1000);
    this.recording = job;
    uiSound('rec');
    this.draw();
  }
  private stopRecording() {
    const job = this.recording;
    if (!job) return;
    this.recording = null;
    job.recorder.stop();
    uiSound('stop');
    this.draw();
  }

  /**
   * Called right after the game renders a frame, while its image is still in
   * the canvas: takes a waiting photo, the first frame of a new clip, and keeps
   * the recording timer.
   */
  afterRender() {
    if (this.photoPending) {
      this.photoPending = false;
      const full = this.grab(), thumb = this.grab(THUMB_WIDTH);
      full.toBlob((blob) => { if (blob) this.add('photo', blob, thumb, 0); }, 'image/jpeg', 0.92);
    }
    if (this.recording) {
      if (!this.recording.thumb) this.recording.thumb = this.grab(THUMB_WIDTH);
      if ((performance.now() - this.recording.started) / 1000 >= MAX_CLIP) this.stopRecording();
      this.draw();
    }
  }
  /** A copy of the canvas as drawn this frame, `width` wide (full size by default). */
  private grab(width = this.host.canvas.width) {
    const source = this.host.canvas, scale = Math.min(1, width / Math.max(1, source.width));
    const copy = document.createElement('canvas');
    copy.width = Math.max(1, Math.round(source.width * scale)); copy.height = Math.max(1, Math.round(source.height * scale));
    copy.getContext('2d')!.drawImage(source, 0, 0, copy.width, copy.height);
    return copy;
  }
  private add(kind: Shot['kind'], blob: Blob, thumb: HTMLCanvasElement, seconds: number) {
    const n = ++this.counts[kind];
    const name = t(kind === 'photo' ? 'camera.photo' : 'camera.clip', { n });
    this.shots.unshift({ id: this.next++, kind, name, blob, thumb, at: new Date(), seconds, place: this.host.place(), saved: false });
    this.host.notify(t('phone.camera'), t(kind === 'photo' ? 'camera.photo_added' : 'camera.clip_added', { name, seconds: Math.round(seconds) }));
    this.onChange();
  }

  /** SAVE TO DEVICE: the photo as a JPG, the clip as a video file. */
  async save(shot: Shot) {
    const place = fileName(shot.place, 'Scoot');
    const ext = shot.kind === 'photo' ? 'jpg' : videoExtension(shot.blob.type);
    const how = await saveToDevice(shot.blob, `${place} ${fileName(shot.name, shot.kind)}.${ext}`);
    shot.saved = true;
    this.onChange();
    return how;
  }
  remove(shot: Shot) {
    const i = this.shots.indexOf(shot);
    if (i >= 0) this.shots.splice(i, 1);
    this.onChange();
  }

  private draw() {
    const job = this.recording;
    this.rec.hidden = !job;
    if (job) {
      const s = Math.floor((performance.now() - job.started) / 1000);
      this.rec.querySelector('span')!.textContent = `${t('camera.rec')} ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }
    this.root.classList.toggle('recording', !!job);
    this.zoomLabel.textContent = `${this.zoom.toFixed(1)}×`;
  }
}
