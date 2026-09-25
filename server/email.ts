export interface EmailEnv { RESEND_API_KEY?: string; ACCOUNT_EMAIL_FROM?: string; ACCOUNT_SITE_ORIGIN?: string }

export function emailReady(env: EmailEnv) {
  try {
    const site = new URL(env.ACCOUNT_SITE_ORIGIN ?? '');
    return !!env.RESEND_API_KEY && !!env.ACCOUNT_EMAIL_FROM && site.protocol === 'https:' && site.origin === env.ACCOUNT_SITE_ORIGIN && !site.username && !site.password;
  } catch { return false; }
}

export async function sendAccountEmail(env: EmailEnv, to: string, subject: string, purpose: string, token: string) {
  if (!emailReady(env)) return false;
  const url = new URL('/', env.ACCOUNT_SITE_ORIGIN);
  url.searchParams.set(purpose === 'reset' ? 'account_reset' : 'account_verify', token);
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    signal: AbortSignal.timeout(10000),
    headers: { authorization: 'Bearer ' + env.RESEND_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: env.ACCOUNT_EMAIL_FROM, to: [to], subject,
      text: `Open this link to ${purpose === 'reset' ? 'reset your Scoot with Friends password' : 'verify your Scoot with Friends email'}:\n\n${url.href}\n\nThis link expires in 30 minutes. If you did not request it, ignore this message.`
    })
  });
  return response.ok;
}
