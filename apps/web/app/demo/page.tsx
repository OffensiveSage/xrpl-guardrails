"use client";

import { useEffect, useState } from "react";
import GuardrailsToggle from "../components/GuardrailsToggle";

const MODE_STORAGE_KEY = "guardrails_mode";

type GuardrailsMode = "enforced" | "bypass";

type Check = {
  name: string;
  status: "pass" | "warn" | "fail";
  details?: string;
};

type StatusPayload = {
  overall: "green" | "yellow" | "red";
  timestamp: string;
  lockfileSha256: string | null;
  checks: Check[];
  bypassEnabled?: boolean;
  simulatedScenario?: "version_mismatch" | null;
};

function getInitialMode(): GuardrailsMode {
  if (typeof window === "undefined") {
    return "enforced";
  }

  const stored = window.localStorage.getItem(MODE_STORAGE_KEY);
  return stored === "bypass" ? "bypass" : "enforced";
}

function isStatusPayload(value: unknown): value is StatusPayload {
  if (value === null || typeof value !== "object") {
    return false;
  }

  return Array.isArray((value as { checks?: unknown }).checks);
}

function isXrplCheck(check: Check) {
  return check.name.toLowerCase().includes("xrpl");
}

function isAuditCheck(check: Check) {
  return check.name === "npm audit policy";
}

function checkStatusColor(status: Check["status"]) {
  if (status === "pass") {
    return "text-green-700";
  }
  if (status === "warn") {
    return "text-yellow-700";
  }
  return "text-red-700";
}

function overallColor(overall: StatusPayload["overall"]) {
  if (overall === "green") {
    return "text-green-700";
  }
  if (overall === "yellow") {
    return "text-yellow-700";
  }
  return "text-red-700";
}

export default function DemoPage() {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [guardrailsMode, setGuardrailsMode] = useState<GuardrailsMode>(getInitialMode);

  useEffect(() => {
    void loadStatus();
  }, []);

  async function loadStatus() {
    try {
      const response = await fetch("/status.json", { cache: "no-store" });

      if (!response.ok) {
        throw new Error(`Failed to fetch /status.json (${response.status})`);
      }

      const data = (await response.json()) as StatusPayload;
      setStatus(data);
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : "Unknown error";
      setStatus(null);
      setError(message);
    }
  }

  function updateMode(nextMode: GuardrailsMode) {
    setGuardrailsMode(nextMode);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(MODE_STORAGE_KEY, nextMode);
    }
  }

  async function runPreflight() {
    setRunning(true);
    setError(null);

    try {
      const endpoint =
        guardrailsMode === "bypass"
          ? "/api/preflight?bypass=1&simulate=version_mismatch"
          : "/api/preflight";
      const response = await fetch(endpoint, {
        method: "POST",
      });

      const body = (await response.json().catch(() => null)) as unknown;
      if (isStatusPayload(body)) {
        setStatus(body);

        if (!response.ok) {
          throw new Error("Guardrails enforced: preflight failed and action is blocked.");
        }
        return;
      }

      const message =
        body !== null &&
        typeof body === "object" &&
        "error" in body &&
        typeof (body as { error?: unknown }).error === "string"
          ? (body as { error: string }).error
          : `Preflight API failed (${response.status})`;
      throw new Error(message);
    } catch (runError) {
      const message = runError instanceof Error ? runError.message : "Unknown error";
      setError(message);
      await loadStatus();
    } finally {
      setRunning(false);
    }
  }

  const auditCheck = status ? status.checks.find(isAuditCheck) ?? null : null;
  const xrplChecks = status
    ? status.checks.filter((check) => isXrplCheck(check) && !isAuditCheck(check))
    : [];
  const otherChecks = status
    ? status.checks.filter((check) => !isXrplCheck(check) && !isAuditCheck(check))
    : [];
  const guardrailsEnabled = guardrailsMode === "enforced";
  const bypassMode = guardrailsMode === "bypass";
  const hasSimulatedMismatch =
    status?.bypassEnabled === true && status.simulatedScenario === "version_mismatch";

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Preflight Demo</h1>
        <GuardrailsToggle
          value={guardrailsEnabled}
          onChange={(next) => updateMode(next ? "enforced" : "bypass")}
          label="Mode"
          onText="Enforced"
          offText="Bypass demo"
          allowed
          showDisabledHint={false}
        />
      </div>

      {bypassMode ? (
        <div className="mb-4 rounded border-2 border-amber-500 bg-amber-50 p-4">
          <p className="font-semibold text-amber-900">
            Guardrails bypass enabled for demo. Unsafe: FAIL will not block actions.
          </p>
          <p className="mt-1 text-sm text-amber-800">
            This mode is only for demos. In production, bypass is disabled.
          </p>
        </div>
      ) : null}

      {hasSimulatedMismatch ? (
        <div className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Simulated mismatch injected for demo.
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => {
          void runPreflight();
        }}
        disabled={running}
        className="mt-4 rounded border px-4 py-2 disabled:opacity-50"
      >
        {running ? "Running..." : "Run Preflight"}
      </button>

      {error ? <p className="mt-4 text-red-600">{error}</p> : null}

      {!status && !error ? <p className="mt-4">Loading status...</p> : null}

      {status ? (
        <section className="mt-6 space-y-4 rounded border p-4">
          <p>
            <strong>Overall:</strong>{" "}
            <span className={overallColor(status.overall)}>
              {status.overall}
            </span>
          </p>
          <p>
            <strong>Timestamp:</strong> {status.timestamp}
          </p>
          <p>
            <strong>Root lockfile SHA-256:</strong>{" "}
            {status.lockfileSha256 ?? "not available"}
          </p>

          {auditCheck ? <h2 className="text-lg font-medium">NPM Audit Policy</h2> : null}
          {auditCheck ? (
            <p className="text-sm text-zinc-600">
              Policy: block on high/critical, warn on low/moderate.
            </p>
          ) : null}
          {auditCheck ? (
            <p>
              <span className={checkStatusColor(auditCheck.status)}>
                {auditCheck.status.toUpperCase()}
              </span>{" "}
              {auditCheck.name}
              {auditCheck.details ? ` (${auditCheck.details})` : ""}
            </p>
          ) : null}

          {xrplChecks.length > 0 ? <h2 className="text-lg font-medium">XRPL Checks</h2> : null}
          {xrplChecks.length > 0 ? (
            <ul className="list-disc space-y-1 pl-6">
              {xrplChecks.map((check) => (
                <li key={check.name}>
                  <span className={checkStatusColor(check.status)}>
                    {check.status.toUpperCase()}
                  </span>{" "}
                  {check.name}
                  {check.details ? ` (${check.details})` : ""}
                </li>
              ))}
            </ul>
          ) : null}

          <h2 className="text-lg font-medium">{xrplChecks.length > 0 ? "Other Checks" : "Checks"}</h2>
          <ul className="list-disc space-y-1 pl-6">
            {otherChecks.map((check) => (
              <li key={check.name}>
                <span className={checkStatusColor(check.status)}>
                  {check.status.toUpperCase()}
                </span>{" "}
                {check.name}
                {check.details ? ` (${check.details})` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
