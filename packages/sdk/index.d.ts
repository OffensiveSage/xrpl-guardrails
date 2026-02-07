import type { Client, ClientOptions } from "xrpl";
import * as xrpl from "xrpl";

export type GuardrailsMode = "enforced" | "bypass";

export type GuardrailsCheck = {
  name: string;
  status: "pass" | "warn" | "fail";
  details?: string;
};

export type GuardrailsOutcome = {
  overall: "green" | "yellow" | "red";
  checks: GuardrailsCheck[];
  timestamp?: string;
  lockfileSha256?: string | null;
  mode: GuardrailsMode;
  blocked: boolean;
  reason: string | null;
  source: "http" | "script";
};

export type GuardrailsOptions = {
  mode?: GuardrailsMode | "enforce" | "eforce";
  expectedXrplVersion?: string;
  preflightEndpoint?: string;
  simulateVersionMismatch?: boolean;
  timeoutMs?: number;
  headers?: Record<string, string>;
  cwd?: string;
  scriptPath?: string;
  statusPath?: string;
  nodePath?: string;
};

export type GuardedClientOptions = GuardrailsOptions & {
  clientOptions?: ClientOptions;
};

export class GuardrailsViolationError extends Error {
  outcome: GuardrailsOutcome;
}

export class GuardedXrplClient {
  readonly client: Client;
  readonly mode: GuardrailsMode;

  constructor(server: string, options?: GuardedClientOptions);

  ensureGuardrails(overrides?: Partial<GuardrailsOptions>): Promise<GuardrailsOutcome>;
  preflight(overrides?: Partial<GuardrailsOptions>): Promise<GuardrailsOutcome>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  request(request: unknown): Promise<unknown>;
  autofill(tx: unknown, signersCount?: number): Promise<unknown>;
  submit(txBlob: string, opts?: unknown): Promise<unknown>;
  submitAndWait(txBlob: string, opts?: unknown): Promise<unknown>;
}

export function preflightGuardrails(options?: GuardrailsOptions): Promise<GuardrailsOutcome>;
export function assertGuardrails(options?: GuardrailsOptions): Promise<GuardrailsOutcome>;
export function createGuardedClient(
  server: string,
  options?: GuardedClientOptions,
): GuardedXrplClient;

export { xrpl };
export * from "xrpl";
