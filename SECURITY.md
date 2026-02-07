# Security Policy

## Security defaults

- No secrets committed.
- No wallet seeds in `localStorage`, `sessionStorage`, `IndexedDB`, or cookies.
- Fail closed by default when policy, validation, or network checks cannot complete.

## Required behavior

- Treat missing or invalid security configuration as a hard failure.
- Deny signing/submission when guardrails cannot verify risk constraints.
- Keep secrets server-side or in-memory only for the shortest practical duration.
- Redact secrets from logs, telemetry, screenshots, and test fixtures.

## Reporting a vulnerability

Report vulnerabilities privately through GitHub Security Advisories if enabled.
If private reporting is unavailable, contact the repository owner directly before public disclosure.

Include:

- affected component(s)
- impact and exploit scenario
- reproduction steps or proof-of-concept
- suggested mitigation (if known)

