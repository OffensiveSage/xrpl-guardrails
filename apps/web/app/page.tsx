"use client";

import { useState } from "react";
import Link from "next/link";
import GuardrailsToggle from "./components/GuardrailsToggle";

const BYPASS_STORAGE_KEY = "guardrails_bypass";

function getInitialGuardrailsEnabled(): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  return window.localStorage.getItem(BYPASS_STORAGE_KEY) !== "true";
}

export default function Home() {
  const [guardrailsEnabled, setGuardrailsEnabled] = useState(getInitialGuardrailsEnabled);

  function updateGuardrailsEnabled(next: boolean) {
    setGuardrailsEnabled(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(BYPASS_STORAGE_KEY, String(!next));
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-6">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-3xl font-semibold">XRPL Guardrails</h1>
          <GuardrailsToggle value={guardrailsEnabled} onChange={updateGuardrailsEnabled} />
        </div>
        <p className="text-zinc-700">
          Run preflight checks before sensitive XRPL actions so risky dependency
          and audit issues are caught early.
        </p>
      </header>

      <section className="space-y-3 rounded border p-4">
        <h2 className="text-lg font-medium">What it checks</h2>
        <ul className="list-disc space-y-1 pl-6">
          <li>XRPL dependency pinning to exact version</li>
          <li>Lockfile alignment for xrpl version</li>
          <li>Lockfile SHA256 drift marker</li>
          <li>
            NPM audit policy (PASS if none, WARN if low or moderate, FAIL if
            high or critical)
          </li>
        </ul>
      </section>

      <section className="space-y-3 rounded border p-4">
        <h2 className="text-lg font-medium">Status meanings</h2>
        <ul className="space-y-1">
          <li>
            <strong>PASS:</strong> No policy violations were found.
          </li>
          <li>
            <strong>WARN:</strong> Non-blocking issues were found and should be
            reviewed.
          </li>
          <li>
            <strong>FAIL:</strong> Blocking issues were found and action should
            stop.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Get started</h2>
        <div className="flex flex-wrap gap-3">
          <Link className="rounded border px-4 py-2" href="/dashboard">
            View Dashboard
          </Link>
          <Link className="rounded border px-4 py-2" href="/demo">
            Run Demo
          </Link>
        </div>
      </section>

      <section className="space-y-2 text-sm">
        <h2 className="text-base font-medium">Endpoints</h2>
        <ul className="space-y-1">
          <li>
            <code>/dashboard</code>
          </li>
          <li>
            <code>/demo</code>
          </li>
          <li>
            <code>/status.json</code>
          </li>
        </ul>
      </section>
    </main>
  );
}
