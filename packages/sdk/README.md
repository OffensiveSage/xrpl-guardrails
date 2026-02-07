# @xrpl-guardrails/sdk

Guardrails wrapper around the official `xrpl` npm package.

## Exports

- `createGuardedClient(server, options)`
- `GuardedXrplClient`
- `preflightGuardrails(options)`
- `assertGuardrails(options)`
- `GuardrailsViolationError`
- All exports from `xrpl`

## Quick example

```js
const { createGuardedClient } = require("@xrpl-guardrails/sdk");

const client = createGuardedClient("wss://s.altnet.rippletest.net:51233", {
  mode: "enforced",
  preflightEndpoint: "http://localhost:3000/api/preflight",
});

await client.connect();
await client.submitAndWait("SIGNED_TX_BLOB");
```
