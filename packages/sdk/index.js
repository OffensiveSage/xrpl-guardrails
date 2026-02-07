const { execFile } = require("node:child_process");
const fs = require("node:fs").promises;
const path = require("node:path");
const { promisify } = require("node:util");
const xrpl = require("xrpl");

const execFileAsync = promisify(execFile);

class GuardrailsViolationError extends Error {
  constructor(message, outcome) {
    super(message);
    this.name = "GuardrailsViolationError";
    this.outcome = outcome;
  }
}

function toErrorMessage(error) {
  return error instanceof Error ? error.message : "Unknown error";
}

function normalizeMode(mode) {
  if (typeof mode === "string") {
    const normalized = mode.trim().toLowerCase();
    if (normalized === "enforced" || normalized === "enforce" || normalized === "eforce") {
      return "enforced";
    }
    if (normalized === "bypass") {
      return "bypass";
    }
  }

  return "enforced";
}

function isCheckStatus(value) {
  return value === "pass" || value === "warn" || value === "fail";
}

function isCheck(value) {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const candidate = value;
  return (
    typeof candidate.name === "string" &&
    isCheckStatus(candidate.status) &&
    (candidate.details === undefined || typeof candidate.details === "string")
  );
}

function isStatusPayload(value) {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const candidate = value;
  return (
    (candidate.overall === "green" ||
      candidate.overall === "yellow" ||
      candidate.overall === "red") &&
    Array.isArray(candidate.checks) &&
    candidate.checks.every(isCheck)
  );
}

function firstFailingCheck(status) {
  return status.checks.find((check) => check.status === "fail") ?? null;
}

function buildFailureReason(status, fallback) {
  const failingCheck = firstFailingCheck(status);
  if (!failingCheck) {
    return fallback;
  }

  return failingCheck.details
    ? `${failingCheck.name} (${failingCheck.details})`
    : failingCheck.name;
}

function withTimeout(timeoutMs) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return { signal: undefined, clear: () => {} };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
  };
}

function readInstalledXrplVersion() {
  try {
    return require("xrpl/package.json").version;
  } catch {
    return null;
  }
}

function assertExpectedXrplVersion(expectedVersion) {
  if (expectedVersion === undefined) {
    return;
  }

  const actualVersion = readInstalledXrplVersion();
  if (!actualVersion) {
    throw new Error("Unable to read installed xrpl version");
  }

  if (actualVersion !== expectedVersion) {
    throw new Error(
      `Installed xrpl version (${actualVersion}) does not match expected version (${expectedVersion})`,
    );
  }
}

async function runHttpPreflight(mode, options) {
  const url = new URL(options.preflightEndpoint);
  url.searchParams.set("mode", mode);

  if (options.simulateVersionMismatch) {
    url.searchParams.set("simulate", "version_mismatch");
  }

  const timeout = withTimeout(options.timeoutMs ?? 10_000);
  let response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: options.headers,
      signal: timeout.signal,
    });
  } finally {
    timeout.clear();
  }

  const payload = await response.json().catch(() => null);
  if (!isStatusPayload(payload)) {
    throw new Error(`Preflight endpoint returned invalid payload (${response.status})`);
  }

  const reason =
    payload.overall === "red"
      ? buildFailureReason(payload, `preflight returned ${response.status}`)
      : null;

  return {
    ...payload,
    mode,
    blocked: mode === "enforced" && payload.overall === "red",
    reason,
    source: "http",
  };
}

async function runScriptPreflight(mode, options) {
  const cwd = options.cwd ?? process.cwd();
  const scriptPath = options.scriptPath ?? path.join(cwd, "scripts", "preflight.ts");
  const statusPath =
    options.statusPath ?? path.join(cwd, "apps", "web", "public", "status.json");
  const nodePath = options.nodePath ?? "node";

  let executionError = null;
  try {
    await execFileAsync(nodePath, [scriptPath], { cwd, env: process.env });
  } catch (error) {
    executionError = toErrorMessage(error);
  }

  let statusPayload = null;

  try {
    const rawStatus = await fs.readFile(statusPath, "utf8");
    const parsed = JSON.parse(rawStatus);
    if (!isStatusPayload(parsed)) {
      throw new Error("status.json does not contain a valid guardrails payload");
    }
    statusPayload = parsed;
  } catch (error) {
    const readError = toErrorMessage(error);
    if (executionError) {
      throw new Error(
        `Preflight script failed (${executionError}) and status file could not be read (${readError})`,
      );
    }
    throw error;
  }

  const fallback =
    executionError ?? (statusPayload.overall === "red" ? "Guardrails checks failed." : "");
  const reason =
    statusPayload.overall === "red" ? buildFailureReason(statusPayload, fallback) : null;

  return {
    ...statusPayload,
    mode,
    blocked: mode === "enforced" && statusPayload.overall === "red",
    reason,
    source: "script",
  };
}

async function preflightGuardrails(options = {}) {
  const mode = normalizeMode(options.mode);
  assertExpectedXrplVersion(options.expectedXrplVersion);

  if (options.preflightEndpoint) {
    return runHttpPreflight(mode, options);
  }

  return runScriptPreflight(mode, options);
}

async function assertGuardrails(options = {}) {
  const outcome = await preflightGuardrails(options);

  if (outcome.mode === "enforced" && outcome.overall === "red") {
    throw new GuardrailsViolationError(
      outcome.reason ?? "Guardrails blocked the action in enforced mode.",
      outcome,
    );
  }

  return outcome;
}

class GuardedXrplClient {
  constructor(server, options = {}) {
    this.mode = normalizeMode(options.mode);
    this.guardrails = {
      ...options,
      mode: this.mode,
    };
    this.client = new xrpl.Client(server, options.clientOptions ?? {});
  }

  async ensureGuardrails(overrides = {}) {
    return assertGuardrails({
      ...this.guardrails,
      ...overrides,
      mode: normalizeMode(overrides.mode ?? this.mode),
    });
  }

  async preflight(overrides = {}) {
    return preflightGuardrails({
      ...this.guardrails,
      ...overrides,
      mode: normalizeMode(overrides.mode ?? this.mode),
    });
  }

  async connect() {
    return this.client.connect();
  }

  async disconnect() {
    return this.client.disconnect();
  }

  isConnected() {
    return this.client.isConnected();
  }

  async request(request) {
    return this.client.request(request);
  }

  async autofill(tx, signersCount) {
    await this.ensureGuardrails();
    return this.client.autofill(tx, signersCount);
  }

  async submit(txBlob, opts) {
    await this.ensureGuardrails();
    return this.client.submit(txBlob, opts);
  }

  async submitAndWait(txBlob, opts) {
    await this.ensureGuardrails();
    return this.client.submitAndWait(txBlob, opts);
  }
}

function createGuardedClient(server, options = {}) {
  return new GuardedXrplClient(server, options);
}

module.exports = {
  ...xrpl,
  xrpl,
  GuardedXrplClient,
  GuardrailsViolationError,
  preflightGuardrails,
  assertGuardrails,
  createGuardedClient,
};
