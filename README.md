# xrpl-guardrails

Monorepo for XRPL guardrails and the Next.js web app.

## Workspaces

- `apps/` for deployable applications
- `packages/` for shared libraries

## Development

1. Install dependencies:
   `npm install`
2. Create local env file from template:
   `cp .env.example apps/web/.env.local`
3. Start the web app:
   `npm run dev`

## Secure defaults

- No secrets committed:
  `.gitignore` excludes `.env*` files except `.env.example`.
- No seeds in browser storage:
  never store seeds/private keys in `localStorage`, `sessionStorage`, or `IndexedDB`.
- Fail closed:
  if a guardrail check is unavailable or fails, block sensitive operations by default.

See `SECURITY.md` for policy and reporting guidance.

