"use client";

import { useEffect, useState } from "react";

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

export default function DashboardPage() {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadStatus();
  }, []);

  async function loadStatus() {
    setError(null);

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

  const auditCheck = status ? status.checks.find(isAuditCheck) ?? null : null;
  const xrplChecks = status
    ? status.checks.filter((check) => isXrplCheck(check) && !isAuditCheck(check))
    : [];
  const otherChecks = status
    ? status.checks.filter((check) => !isXrplCheck(check) && !isAuditCheck(check))
    : [];
  const showDemoBypassBanner =
    status?.bypassEnabled === true || status?.simulatedScenario === "version_mismatch";

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold">Preflight Dashboard</h1>

      {showDemoBypassBanner ? (
        <div className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Demo-only guardrails bypass metadata detected in status report.
        </div>
      ) : null}

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
