# Deployment and domain

The owner made the GitHub repository PUBLIC on 2026-09-24 so GitHub Pages works on the free plan (no GitHub Pro). Treat all source and history as public: never commit credentials, `.env*` or `owner-private.json`. Making the repository private again takes the Pages site down unless the account upgrades to Pro. The existing Sites project (`.openai/hosting.json`, no credentials) still hosts the public game with its server features; never create another Sites project.

## GitHub Pages: scootwithfriends.online

The owner approved automatic deployment on 2026-09-24. `.github/workflows/deploy-pages.yml` runs on every push to `main` (and on manual dispatch): `npm ci`, `npm test`, `npm run build`, then publishes `dist/client` to Pages. A failing test or build publishes nothing. Merging to `main` therefore updates the live site, so only merge tested work.

- Settings → Pages → Source must be **GitHub Actions**. Deploying from a branch publishes the raw Vite source and fails.
- Custom domain `scootwithfriends.online`, also recorded in `CNAME`. The registrar is Namecheap: apex A records point to 185.199.108.153–185.199.111.153 and `www` is a CNAME to `differentlightproductions-cyber.github.io`. Preserve unrelated mail records and keep domain auto-renew on.
- Tick **Enforce HTTPS** once GitHub has issued the certificate for the domain.
- Pages is static only. Sign-in/cloud save, authenticated park publishing and private rooms need a server and are unavailable there; solo riding and on-device saves work. The static site must not pretend those services exist.

## Build outputs

Build with Node 22: `npm ci`, `npm run build`. Outputs: browser assets in `dist/client`, optional Workers-compatible service in `dist/server/index.js`, deployment manifest in `dist/.openai`. For a static host use `dist/client`; authenticated park publishing requires a compatible server and R2 binding.

Do not publish owner keys in client assets; store the real publishing token only as a server secret. The ordinary Windows copy runs with a local-only Node server and remains playable independently of coding credits.
