import type { InputFrame } from '../input/input';
import { accountRequest, CloudSync } from '../data/cloud';
/** One cloud sync for the whole game (started in main.ts). */
export const cloud = new CloudSync();
export class AccountPanel {
  dialog = document.createElement('dialog');
  private mode = 'login'; private busy = false; private cooldown = 0;
  private account: { id: string; username: string; email: string | null; pendingEmail: string | null; marketingConsent: boolean } | null = null;
  private emailReady = false;
  private pendingVerify = '';
  private pendingReset = '';
  private recovery = '';
  private unavailable = false;
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
  async open() {
    const url = new URL(location.href);
    this.pendingReset = url.searchParams.get('account_reset') ?? '';
    this.pendingVerify = url.searchParams.get('account_verify') ?? '';
    if (this.pendingReset || this.pendingVerify) {
      url.searchParams.delete('account_reset'); url.searchParams.delete('account_verify');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
    if (this.pendingReset) this.mode = 'email-reset';
    this.dialog.showModal(); this.render(); await this.refresh();
    if (this.pendingVerify && this.account) { await this.verifyEmail(); if (!this.pendingVerify) await cloud.signedIn(this.account); }
  }
  private request(action: string, data?: unknown) { return accountRequest(action, data); }
  private status(message: string) { const el = this.dialog.querySelector('[role=status]'); if (el) el.textContent = message; }
  private async refresh() {
    if (this.busy) return; this.busy = true; this.status('Checking your account…');
    try { const result = await this.request('session'); this.unavailable = false; this.account = result.account; this.emailReady = !!result.emailReady; this.render(); this.status(this.account ? 'Signed in.' : 'Sign in or create a game account.'); if (this.account && !this.pendingReset && !this.pendingVerify) { this.busy = false; await cloud.signedIn(result.account); this.status(cloud.status); } }
    catch (e) { this.unavailable = (e as { code?: string }).code === 'ACCOUNT_UNAVAILABLE'; this.render(); this.status((e as Error).message); } finally { this.busy = false; }
  }
  private render() {
    const signed = !!this.account, register = this.mode === 'register', recover = this.mode === 'recover';
    if (this.choice) { this.renderChoice(); return; }
    if (this.unavailable) {
      this.dialog.innerHTML = `<h2>YOUR ACCOUNT</h2><p>Sign-in is not connected on this website yet. You can sign in, create an account and play on the existing account-enabled version.</p><p>Device-only progress stays with this website. Opening the other version does not automatically transfer it.</p><button type="button" data-account-site>Open account-enabled game</button><button type="button" data-retry>Retry connection</button><p role="status" aria-live="polite"></p><button type="button" data-close>Back to game</button>`;
      this.dialog.querySelector<HTMLButtonElement>('[data-account-site]')!.onclick = () => location.assign('https://scoot-with-friends.nicsoundcloud22.chatgpt.site/');
      this.dialog.querySelector<HTMLButtonElement>('[data-retry]')!.onclick = () => { void this.refresh(); };
      this.dialog.querySelector<HTMLButtonElement>('[data-close]')!.onclick = () => this.dialog.close();
      return;
    }
    if (this.mode === 'email-request' || this.mode === 'email-reset') {
      const reset = this.mode === 'email-reset';
      this.dialog.innerHTML = `<h2>${reset ? 'RESET PASSWORD' : 'EMAIL RECOVERY'}</h2><p>${reset ? 'Choose a new password. After resetting, save your new recovery code.' : 'Enter the verified email on your game account. If it matches, we will send a reset link.'}</p><form>${reset ? '<label>New password<input name="password" type="password" autocomplete="new-password" required minlength="12" maxlength="128"></label>' : '<label>Email<input name="email" type="email" autocomplete="email" required maxlength="254"></label>'}<button type="submit">${reset ? 'Reset password' : 'Send reset link'}</button></form><div class="account-actions"><button type="button" data-back>Back to sign in</button></div><p role="status" aria-live="polite"></p><section class="recovery-code" hidden><strong>Save your recovery code</strong><p>This new code replaces the old one. Keep it in your password manager.</p><textarea readonly aria-label="Recovery code"></textarea><button type="button" data-saved>I saved my recovery code</button></section>`;
      this.dialog.querySelector('form')!.onsubmit = e => { e.preventDefault(); const form = e.currentTarget as HTMLFormElement; if (!form.reportValidity()) return; const data = Object.fromEntries(new FormData(form)); if (reset) data.token = this.pendingReset; void this.submit(reset ? 'email-reset' : 'email-reset-request', data); };
      this.dialog.querySelector<HTMLButtonElement>('[data-back]')!.onclick = () => { this.mode = 'login'; this.render(); };
      return;
    }
    this.dialog.innerHTML = `<h2>YOUR ACCOUNT</h2><p class="account-identity"></p><p>${signed ? 'Your Credit, parts, level, missions, crates and rider save to your account and follow you to any device. They stay on this device too.' : 'Sign in to keep your progress (Credit, parts, level, missions and crates) in the cloud and play it on any device. Without an account it saves on this device only.'} Game accounts are separate from ChatGPT.</p><form><label>Username<input name="username" autocomplete="username" required minlength="3" maxlength="24" pattern="[A-Za-z0-9_]{3,24}" autocapitalize="none" spellcheck="false"></label>${register ? '<label>Email for password recovery<input name="email" type="email" autocomplete="email" required maxlength="254"></label><label><input name="marketingConsent" type="checkbox" checked> Email me game news and offers (optional)</label>' : ''}${recover ? '<label>Recovery code<input name="recovery" autocomplete="off" required maxlength="64"></label>' : ''}<label>${recover ? 'New password' : 'Password'}<input name="password" type="password" autocomplete="${register || recover ? 'new-password' : 'current-password'}" required minlength="12" maxlength="128"></label><small>At least 12 characters. Use a password unique to this game.</small><button type="submit">${register ? 'Create account' : recover ? 'Reset password' : 'Sign in'}</button></form><div class="account-actions"></div><p role="status" aria-live="polite"></p><section class="recovery-code" hidden><strong>Save your recovery code</strong><p>This code is shown once. Keep it in your password manager. You will need it if you forget your password.</p><textarea readonly aria-label="Recovery code"></textarea><button type="button" data-saved>I saved my recovery code</button></section><button type="button" data-close>Back to game</button>`;
    this.dialog.querySelector('.account-identity')!.textContent = signed ? `Signed in as ${this.account!.username}` : 'Sign in / Create account';
    const form = this.dialog.querySelector('form')!; form.hidden = signed;
    const actions = this.dialog.querySelector('.account-actions')!;
    const button = (text: string, action: () => void) => { const el = document.createElement('button'); el.type = 'button'; el.textContent = text; el.onclick = () => { if (!this.busy) action(); }; actions.append(el); };
    if (!signed) { button(register ? 'Already have an account? Sign in' : 'Create an account', () => { this.mode = register ? 'login' : 'register'; this.render(); }); button('Forgot password? Use recovery code', () => { this.mode = 'recover'; this.render(); }); if (this.emailReady) button('Reset with verified email', () => { this.mode = 'email-request'; this.render(); }); }
    if (signed) {
      const note = document.createElement('p');
      note.textContent = this.account!.email ? `Verified email: ${this.account!.email}` : this.account!.pendingEmail ? `Unverified email: ${this.account!.pendingEmail}. Recovery by email starts after verification.` : 'No verified email. Add one for email recovery.';
      actions.append(note);
      if (!this.emailReady) { const offline = document.createElement('p'); offline.textContent = 'Email verification is not configured yet. Keep your recovery code safe.'; actions.append(offline); }
      else button('Add or change email', () => { void this.changeEmail(); });
      button(this.account!.marketingConsent ? 'Opt out of game news' : 'Opt in to game news', () => { void this.changeConsent(!this.account!.marketingConsent); });
    }
    button(signed ? 'Sync now' : 'Refresh account', () => { void this.refresh(); });
    if (signed) button('Sign out', () => { void this.submit('logout', {}); });
    form.onsubmit = e => { e.preventDefault(); if (form.reportValidity()) { const data: Record<string, unknown> = Object.fromEntries(new FormData(form)); if (register) data.marketingConsent = (form.elements.namedItem('marketingConsent') as HTMLInputElement).checked; void this.submit(this.mode, data); } };
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
    try { const result = await this.request(action, data); if (action === 'email-reset-request') { this.render(); this.status('If this is a verified account email, a reset link is on its way.'); return; } this.account = result.account; this.recovery = result.recovery ?? ''; if (action === 'email-reset') { this.pendingReset = ''; this.mode = 'login'; } if(!this.account)this.mode='login'; this.render(); this.status(this.account ? 'Signed in. Syncing your progress…' : 'Signed out. Your progress stays on this device.');
      if (this.account && this.pendingVerify) await this.verifyEmail();
      if (this.account && !this.pendingVerify) { this.busy = false; await cloud.signedIn(result.account); if (!this.choice) this.status(cloud.status); } else if (!this.account) cloud.signedOut(); }
    catch (e) { this.status((e as Error).message); this.dialog.querySelectorAll('button').forEach(b => b.disabled = false); }
    finally { this.busy = false; }
  }
  private changeEmail() {
    const actions = this.dialog.querySelector('.account-actions')!;
    actions.querySelector('[data-email-form]')?.remove();
    const form = document.createElement('form'); form.dataset.emailForm = 'true';
    form.innerHTML = '<label>Email to verify<input name="email" type="email" autocomplete="email" required maxlength="254"></label><label>Current game password<input name="password" type="password" autocomplete="current-password" required></label><button type="submit">Send verification link</button>';
    form.querySelector<HTMLInputElement>('[name=email]')!.value = this.account?.pendingEmail ?? this.account?.email ?? '';
    form.onsubmit = async e => {
      e.preventDefault(); if (!form.reportValidity() || this.busy) return;
      this.busy = true;
      try {
        const result = await this.request('email-request', Object.fromEntries(new FormData(form)));
        this.account = result.account; this.render(); this.status('Verification link sent. Open it while signed in to this account.');
      } catch (error) { this.status((error as Error).message); }
      finally { this.busy = false; }
    };
    actions.append(form); form.querySelector<HTMLInputElement>('[name=email]')!.focus();
  }
  private async verifyEmail() {
    try {
      const result = await this.request('email-verify', { token: this.pendingVerify });
      this.account = result.account; this.pendingVerify = '';
      this.render(); this.status('Email verified. Email recovery is ready.');
    } catch (e) { this.status((e as Error).message); }
  }
  private async changeConsent(consent: boolean) {
    try { const result = await this.request('email-consent', { consent }); this.account = result.account; this.render(); this.status(consent ? 'Game news preference saved.' : 'You are opted out of game news.'); }
    catch (e) { this.status((e as Error).message); }
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
