# Deployment and domain

The GitHub source stays PRIVATE. The user explicitly corrected the private-alpha brief: updates to the existing public game remain authorized after testing. There is no automatic deployment in GitHub Actions. Never create another Sites project. The existing `.openai/hosting.json` identifies the current Sites project and R2 binding; it contains no credentials.

Build with Node 22: `npm ci`, `npm run build`. Outputs: browser assets in `dist/client`, optional Workers-compatible service in `dist/server/index.js`, deployment manifest in `dist/.openai`. For a static host use `dist/client`; authenticated park publishing requires a compatible server and R2 binding. A plain static host must not pretend the publishing service is available.

The purchased domain and DNS have NOT been changed. When the owner explicitly authorizes attaching the domain:

1. Connect this private GitHub repository to the chosen host using limited repository access.
2. Create a deployment with the verified build command/output and server bindings if needed.
3. Add the exact purchased domain to that host.
4. Set the registrar DNS records provided by the host; preserve unrelated mail records.
5. Enable and verify HTTPS.
6. Enable domain auto-renew with the registrar.
7. Choose root or www as canonical and redirect the other.
8. Only enable automatic deployment from tested main after explicit approval.

No domain ownership, DNS records, production host connection, or future custom domain is assumed. Do not publish owner keys in client assets; store the real publishing token only as a server secret. The ordinary Windows copy runs with a local-only Node server and remains playable independently of coding credits.
