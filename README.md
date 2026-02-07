# XRPL Guardrails

XRPL Guardrails is a lightweight preflight system that checks dependency integrity and supply chain risk before sensitive XRPL related actions run. It generates a small posture report (PASS, WARN, FAIL) and exposes it through a dashboard and a one click demo runner.

## What it does

Guardrails currently enforce:

- XRPL dependency pinning: the `xrpl` package must be pinned to an exact version in `apps/web/package.json` (no caret or tilde).
- Lockfile alignment: the root `package-lock.json` must resolve the same `xrpl` version.
- Lockfile integrity marker: computes a SHA256 hash of the root lockfile for drift detection.
- NPM audit policy:
  - FAIL if any high or critical vulnerabilities exist
  - WARN if only low or moderate vulnerabilities exist
  - PASS if no vulnerabilities exist

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
