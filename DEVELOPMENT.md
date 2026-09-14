# Private alpha development

GitHub is the source of truth: https://github.com/differentlightproductions-cyber/scoot-with-friends (PRIVATE).
Use Node 22 and npm. Install exactly the lockfile with `npm ci`.

## Everyday commands

```
npm ci
npm run dev
npm test
npm run build
npm run preview
```

Vite prints the local address. `npm run preview` serves `dist/client`; it does not provide the optional hosted park-publishing API. Riding and local saves work offline. The build type-checks TypeScript, builds Vite assets, then bundles the Workers-compatible publishing service. No separate lint tool is configured. Browser regressions under `tests/*.browser.mjs` currently use Windows Chrome and a dev server on port 5174; they are local checks, not portable CI. CI runs the unit suite and production build only.

## Branches and review

`main` is the latest tested alpha; `develop` is integration. Start larger tasks from up-to-date develop on `codex/feature-name`, `fix/name`, `physics/name`, or `visual/name`. Never force-push shared branches. Pull before editing, commit a safe point before large AI changes, review `git diff`, run tests/build, then push the task branch and open a PR into develop. Promote develop to main only after testing. Do not use main as scratch work.

Two AI tools must use separate clones or worktrees and separate branches. Do not run Codex and Claude Code editing the same checkout concurrently. Exchange changes through Git and PRs, not ZIP copies. Before starting, read AGENTS.md and SYSTEMS.md and check `git status`.

## Claude Code in a second clone

```
git clone https://github.com/differentlightproductions-cyber/scoot-with-friends.git
cd scoot-with-friends
npm ci
npm run build
git switch develop
git pull --ff-only
git switch -c fix/example
claude
```

Install/authenticate Claude Code separately if `claude` is unavailable. Give Claude a bounded task; it should edit, test, build, inspect its diff, commit, and push its branch for review. GitHub access to the PRIVATE repository is required. Codex follows the same branch workflow.

## Secrets and backups

Never commit `.env*`, the owner publisher configuration, tokens, keys, or owner ZIPs. `.env.example` has placeholders only. GitHub history plus local clones and alpha tags are backups; the hosting provider is not the source backup. Keep the previous playable player ZIP when packaging. `npm run package:windows` bundles the current built client; the owner package is generated only when a local ignored owner configuration exists.

## Main protection

GitHub Settings → Branches → Add branch protection rule → pattern `main`: require a pull request, require status check **Build and unit tests**, require branch up to date before merge, disable force pushes, disable deletions. Use one approving review when another collaborator is available. If private-repository branch protection requires a plan upgrade, enforce these rules through review until upgraded. No workflow deploys or changes DNS.
