"use client";

import { useEffect, useState } from "react";

type Check = {
  name: string;
  ok: boolean;
  details?: string;
};

type StatusPayload = {
  overall: "green" | "red";
  timestamp: string;
  lockfileSha256: string | null;
  checks: Check[];
};

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

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold">Preflight Dashboard</h1>

      {error ? <p className="mt-4 text-red-600">{error}</p> : null}

      {!status && !error ? <p className="mt-4">Loading status...</p> : null}

      {status ? (
        <section className="mt-6 space-y-4 rounded border p-4">
          <p>
            <strong>Overall:</strong>{" "}
            <span className={status.overall === "green" ? "text-green-700" : "text-red-700"}>
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

          <h2 className="text-lg font-medium">Checks</h2>
          <ul className="list-disc space-y-1 pl-6">
            {status.checks.map((check) => (
              <li key={check.name}>
                <span className={check.ok ? "text-green-700" : "text-red-700"}>
                  {check.ok ? "PASS" : "FAIL"}
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
