# Account email recovery

The Worker applies the additive email schema through `server/account-schema.ts` before account queries because Sites does not apply packaged migrations. `0002_account_email.sql` remains the schema reference for fresh databases; do not manually reapply it to a database already upgraded by the Worker. It only adds nullable fields and indexes; existing usernames, password hashes, recovery codes, sessions, and cloud saves remain valid.

Configure these server environment values on the existing Sites project:

- `RESEND_API_KEY`: a Resend API key authorized to send from the verified domain.
- `ACCOUNT_EMAIL_FROM`: a verified sender, for example `Scoot with Friends <accounts@scootwithfriends.online>`.
- `ACCOUNT_SITE_ORIGIN`: the exact canonical HTTPS origin, `https://scootwithfriends.online` (no trailing slash).

Do not put the key in client assets, Git, or an example with a real value. Resend sends only verification and password reset messages through `POST https://api.resend.com/emails`. Promotional consent is stored as an explicit boolean and timestamp; this implementation sends no promotional mail.

Registration requires an email and records it as **pending**. Only possession of a one-use, 30-minute verification link moves it to the unique verified email field. Existing accounts can add or change email while signed in by proving their current password, then following the verification link. Their old verified address remains valid until the new one is verified. With delivery unconfigured, the email stays pending and recovery codes continue to work. A reset request gives the same response for a known or unknown verified email. The one-use reset link changes the password, rotates the recovery code, and revokes sessions.

Verification links require the player to sign in to the account that requested them. The account panel reads `?account_verify=...` and `?account_reset=...`; the game entry point opens that panel directly for either query parameter, before cloud syncing. Those query parameters are removed from the browser address immediately and held in page memory while the flow completes. The page also needs a `no-referrer` policy to protect the initial request.

Before public use, test on the deployed Worker: migration, verification delivery and link, unknown-email response, reset and old-session revocation, old recovery-code invalidation, and a previously created account. The local unit test mocks Resend and never sends real mail.

Resend API reference: https://resend.com/docs/api-reference/emails/send-email
