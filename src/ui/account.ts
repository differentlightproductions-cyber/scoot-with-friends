import type { InputFrame } from '../input/input';
export class AccountPanel {
  dialog = document.createElement('dialog');
  private mode = 'login'; private busy = false; private cooldown = 0;
  private account: { username: string } | null = null;
  private recovery = '';
  constructor() {
    this.dialog.id = 'account-dialog'; document.body.append(this.dialog);
    window.addEventListener('keydown', e => { if (this.dialog.open) e.stopImmediatePropagation(); }, true);
    this.dialog.addEventListener('cancel', e => { if (this.busy || this.recovery) e.preventDefault(); });
  }
  async open() { this.dialog.showModal(); this.render(); await this.refresh(); }
  private async request(action: string, data?: unknown) {
    const response = await fetch('/api/account/' + action, { credentials: 'same-origin', cache: 'no-store', ...(data ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) } : {}) });
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Accounts are available on the published website. This local copy remains playable without sign-in.');
    const result = await response.json(); if (!response.ok) throw new Error(result.error ?? 'Please try again.'); return result;
  }
  private status(message: string) { const el = this.dialog.querySelector('[role=status]'); if (el) el.textContent = message; }
  private async refresh() {
    if (this.busy) return; this.busy = true; this.status('Checking your account…');
    try { const result = await this.request('session'); this.account = result.account; this.render(); this.status(this.account ? 'Your account is up to date.' : 'Sign in or create a game account.'); }
    catch (e) { this.status((e as Error).message); } finally { this.busy = false; }
  }
  private render() {
    const signed = !!this.account, register = this.mode === 'register', recover = this.mode === 'recover';
    this.dialog.innerHTML = `<h2>YOUR ACCOUNT</h2><p class="account-identity"></p><p>Game accounts are separate from ChatGPT. Equipment, Credit and progress still save on this device.</p><form><label>Username<input name="username" autocomplete="username" required minlength="3" maxlength="24" pattern="[A-Za-z0-9_]{3,24}" autocapitalize="none" spellcheck="false"></label>${recover ? '<label>Recovery code<input name="recovery" autocomplete="off" required maxlength="64"></label>' : ''}<label>${recover ? 'New password' : 'Password'}<input name="password" type="password" autocomplete="${register || recover ? 'new-password' : 'current-password'}" required minlength="12" maxlength="128"></label><small>At least 12 characters. Use a password unique to this game.</small><button type="submit">${register ? 'Create account' : recover ? 'Reset password' : 'Sign in'}</button></form><div class="account-actions"></div><p role="status" aria-live="polite"></p><section class="recovery-code" hidden><strong>Save your recovery code</strong><p>This code is shown once. Keep it in your password manager. You will need it if you forget your password.</p><textarea readonly aria-label="Recovery code"></textarea><button type="button" data-saved>I saved my recovery code</button></section><button type="button" data-close>Back to game</button>`;
    this.dialog.querySelector('.account-identity')!.textContent = signed ? `Signed in as ${this.account!.username}` : 'Sign in / Create account';
    const form = this.dialog.querySelector('form')!; form.hidden = signed;
    const actions = this.dialog.querySelector('.account-actions')!;
    const button = (text: string, action: () => void) => { const el = document.createElement('button'); el.type = 'button'; el.textContent = text; el.onclick = () => { if (!this.busy) action(); }; actions.append(el); };
    if (!signed) { button(register ? 'Already have an account? Sign in' : 'Create an account', () => { this.mode = register ? 'login' : 'register'; this.render(); }); button('Forgot password? Use recovery code', () => { this.mode = 'recover'; this.render(); }); }
    button('Refresh account', () => { void this.refresh(); });
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
  private async submit(action: string, data: unknown) {
    if (this.busy) return; this.busy = true; this.status('Please wait…'); this.dialog.querySelectorAll('button').forEach(b => b.disabled = true);
    try { const result = await this.request(action, data); this.account = result.account; this.recovery = result.recovery ?? ''; this.render(); this.status(this.account ? 'Signed in. Your local setup is unchanged.' : 'Signed out.'); }
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
    if ((input.pressed.brakeBars || input.pressed.pause) && !this.recovery) this.dialog.close();
  }
}
