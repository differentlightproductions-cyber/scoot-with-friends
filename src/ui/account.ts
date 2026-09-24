import type { InputFrame } from '../input/input';
import { accountRequest, CloudSync } from '../data/cloud';
/** One cloud sync for the whole game (started in main.ts). */
export const cloud = new CloudSync();
export class AccountPanel {
  dialog = document.createElement('dialog');
  private mode = 'login'; private busy = false; private cooldown = 0;
  private account: { username: string } | null = null;
  private recovery = '';
  /** A pending choice between this device's progress and the account's. */
  private choice: { device: { level: number; credit: number; parts: number }; cloud: { level: number; credit: number; parts: number; updated: number }; resolve: (c: 'cloud' | 'device') => void } | null = null;
  constructor() {
    this.dialog.id = 'account-dialog'; document.body.append(this.dialog);
    cloud.onStatus = status => { if (this.dialog.open && !this.busy) this.status(status); };
    cloud.onAsk = (device, copy) => new Promise(resolve => { this.choice = { device, cloud: copy, resolve }; if (!this.dialog.open) this.dialog.showModal(); this.render(); });
    cloud.onApply = () => this.status('Loading your cloud save…');
    window.addEventListener('keydown', e => { if (this.dialog.open) e.stopImmediatePropagation(); }, true);
    this.dialog.addEventListener('cancel', e => { if (this.busy || this.recovery || this.choice) e.preventDefault(); });
  }
  async open() { this.dialog.showModal(); this.render(); await this.refresh(); }
  private request(action: string, data?: unknown) { return accountRequest(action, data); }
  private status(message: string) { const el = this.dialog.querySelector('[role=status]'); if (el) el.textContent = message; }
  private async refresh() {
    if (this.busy) return; this.busy = true; this.status('Checking your account…');
    try { const result = await this.request('session'); this.account = result.account; this.render(); this.status(this.account ? 'Signed in.' : 'Sign in or create a game account.'); if (this.account) { this.busy = false; await cloud.signedIn(result.account); this.status(cloud.status); } }
    catch (e) { this.status((e as Error).message); } finally { this.busy = false; }
  }
  private render() {
    const signed = !!this.account, register = this.mode === 'register', recover = this.mode === 'recover';
    if (this.choice) { this.renderChoice(); return; }
    this.dialog.innerHTML = `<h2>YOUR ACCOUNT</h2><p class="account-identity"></p><p>${signed ? 'Your Credit, parts, level, missions, crates and rider save to your account and follow you to any device. They stay on this device too.' : 'Sign in to keep your progress (Credit, parts, level, missions and crates) in the cloud and play it on any device. Without an account it saves on this device only.'} Game accounts are separate from ChatGPT.</p><form><label>Username<input name="username" autocomplete="username" required minlength="3" maxlength="24" pattern="[A-Za-z0-9_]{3,24}" autocapitalize="none" spellcheck="false"></label>${recover ? '<label>Recovery code<input name="recovery" autocomplete="off" required maxlength="64"></label>' : ''}<label>${recover ? 'New password' : 'Password'}<input name="password" type="password" autocomplete="${register || recover ? 'new-password' : 'current-password'}" required minlength="12" maxlength="128"></label><small>At least 12 characters. Use a password unique to this game.</small><button type="submit">${register ? 'Create account' : recover ? 'Reset password' : 'Sign in'}</button></form><div class="account-actions"></div><p role="status" aria-live="polite"></p><section class="recovery-code" hidden><strong>Save your recovery code</strong><p>This code is shown once. Keep it in your password manager. You will need it if you forget your password.</p><textarea readonly aria-label="Recovery code"></textarea><button type="button" data-saved>I saved my recovery code</button></section><button type="button" data-close>Back to game</button>`;
    this.dialog.querySelector('.account-identity')!.textContent = signed ? `Signed in as ${this.account!.username}` : 'Sign in / Create account';
    const form = this.dialog.querySelector('form')!; form.hidden = signed;
    const actions = this.dialog.querySelector('.account-actions')!;
    const button = (text: string, action: () => void) => { const el = document.createElement('button'); el.type = 'button'; el.textContent = text; el.onclick = () => { if (!this.busy) action(); }; actions.append(el); };
    if (!signed) { button(register ? 'Already have an account? Sign in' : 'Create an account', () => { this.mode = register ? 'login' : 'register'; this.render(); }); button('Forgot password? Use recovery code', () => { this.mode = 'recover'; this.render(); }); }
    button(signed ? 'Sync now' : 'Refresh account', () => { void this.refresh(); });
    if (signed) button('Sign out', () => { void this.submit('logout', {}); });
    form.onsubmit = e => { e.preventDefault(); if (form.reportValidity()) void this.submit(this.mode, Object.fromEntries(new FormData(form))); };
    this.dialog.querySelector<HTMLButtonElement>('[data-close]')!.onclick = () => { if (!this.busy && !this.recovery) this.dialog.close(); };
    if (this.recovery) {
      this.dialog.querySelector<HTMLElement>('.recovery-code')!.hidden = false;
      this.dialog.querySelector<HTMLTextAreaElement>('textarea')!.value = this.recovery;
      actions.querySelectorAll('button').forEach(b => b.disabled = true);
      this.dialog.querySelector<HTMLButtonElement>('[data-close]')!.disabled = true;
      this.dialog.querySelector<HTMLButtonElement>('[data-saved]')!.onclick = () => { this.recovery = ''; this.render(); };
    }
  }
  /** Two saves disagree: show both and let the player pick which to keep. */
  private renderChoice() {
    const c = this.choice!, ago = (t: number) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' days ago'; };
    const card = (title: string, s: { level: number; credit: number; parts: number }, note: string) => `<div class="account-save"><strong>${title}</strong><span>Level ${s.level} · ${s.credit.toLocaleString('en-US')} Credit · ${s.parts} parts</span><small>${note}</small></div>`;
    this.dialog.innerHTML = `<h2>WHICH PROGRESS?</h2><p>Your account and this device both have progress. Pick the one to keep. The other is set aside, never mixed.</p>${card('YOUR ACCOUNT', c.cloud, 'Saved ' + ago(c.cloud.updated))}${card('THIS DEVICE', c.device, 'On this browser')}<div class="account-actions"><button type="button" data-pick="cloud">Use my account progress</button><button type="button" data-pick="device">Keep this device's progress</button></div><p role="status" aria-live="polite"></p>`;
    this.dialog.querySelectorAll<HTMLButtonElement>('[data-pick]').forEach(b => b.onclick = () => { const pick = b.dataset.pick as 'cloud' | 'device'; const resolve = c.resolve; this.choice = null; this.render(); this.status(pick === 'cloud' ? 'Loading your account progress…' : 'Saving this device to your account…'); resolve(pick); });
    this.dialog.querySelector<HTMLButtonElement>('[data-pick]')?.focus();
  }
  private async submit(action: string, data: unknown) {
    if (this.busy) return; this.busy = true; this.status('Please wait…'); this.dialog.querySelectorAll('button').forEach(b => b.disabled = true);
    try { const result = await this.request(action, data); this.account = result.account; this.recovery = result.recovery ?? ''; if(!this.account)this.mode='login'; this.render(); this.status(this.account ? 'Signed in. Syncing your progress…' : 'Signed out. Your progress stays on this device.');
      if (this.account) { this.busy = false; await cloud.signedIn(result.account); if (!this.choice) this.status(cloud.status); } else cloud.signedOut(); }
    catch (e) { this.status((e as Error).message); this.dialog.querySelectorAll('button').forEach(b => b.disabled = false); }
    finally { this.busy = false; }
  }
  update(input: InputFrame, dt: number) {
    if (!this.dialog.open || this.busy) return;
    this.cooldown = Math.max(0, this.cooldown - dt);
    const direction = input.held.marker > .5 ? -1 : input.held.menuDown > .5 ? 1 : Math.abs(input.lean) > .5 ? Math.sign(input.lean) : 0;
    const fields = [...this.dialog.querySelectorAll<HTMLElement>('input,button,textarea')].filter(el => el.getClientRects().length && !(el as HTMLButtonElement).disabled);
    if (direction && !this.cooldown) { const index = fields.indexOf(document.activeElement as HTMLElement); fields[(index + direction + fields.length) % fields.length]?.focus(); this.cooldown = .22; }
    if (input.pressed.hop) (document.activeElement as HTMLElement)?.click();
    if ((input.pressed.brakeBars || input.pressed.pause) && !this.recovery && !this.choice) this.dialog.close();
  }
}
