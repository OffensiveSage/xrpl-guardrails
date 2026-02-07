# XRPL Guardrails

XRPL Guardrails is a lightweight preflight system that checks dependency integrity and supply chain risk before sensitive XRPL related actions run. It generates a small posture report (PASS, WARN, FAIL) and exposes it through a dashboard and a one click demo runner.

## What it does

Guardrails currently enforce:

- XRPL dependency pinning: the `xrpl` package must be pinned to an exact version in `apps/web/package.json` (no caret or tilde).
- Lockfile alignment: the root `package-lock.json` must resolve the same `xrpl` version.
- Lockfile integrity marker: computes a SHA256 hash of the root lockfile for drift detection.
- NPM audit policy FAIL if any high or critical vulnerabilities exist.
- NPM audit policy WARN if only low or moderate vulnerabilities exist.
- NPM audit policy PASS if no vulnerabilities exist.

Policy: block on high/critical, warn on low/moderate.

## Repo structure

- `apps/web` Next.js app with the dashboard and demo pages
- `scripts/preflight.ts` preflight verifier that generates `apps/web/public/status.json`
- `apps/web/public/status.json` generated posture report

## How to run

From the repo root:

```bash
npm install
npm run preflight
npm run dev
```

## Endpoints

- `/dashboard` view the current preflight posture report.
- `/demo` run preflight again from the UI and view updated results.
- `/status.json` read the generated machine-readable posture report.

## Demo toggle

The home page and demo page include a guardrails bypass toggle for demonstration purposes. By default, the toggle is disabled.

**To enable the toggle**:

1. Set `NEXT_PUBLIC_DEMO_ALLOW_BYPASS=true` in your environment (e.g., `apps/web/.env.local`)
2. Ensure `NODE_ENV` is not set to `production`

**Security notes**:

- When bypass is enabled and the toggle is switched OFF, the demo page sends `X-Guardrails-Bypass: true` to the API, which returns HTTP 200 even if checks fail.
- The bypass feature is automatically disabled in production environments.
- This feature is intended for **demo purposes only** and should never be used in production.

**Toggle state**:

- Toggle state is persisted in browser `localStorage` under the key `guardrails_bypass`
- Default: ON (bypass disabled)
- When OFF: guardrails are bypassed
