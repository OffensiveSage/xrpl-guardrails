"use client";

import { useState } from "react";
import GuardrailsToggle from "../components/GuardrailsToggle";
import {
  readGuardrailsModeFromStorage,
  type GuardrailsMode,
  writeGuardrailsModeToStorage,
} from "../lib/guardrailsMode";

type Account = "alice" | "bob";

type Check = {
  name: string;
  status: "pass" | "warn" | "fail";
  details?: string;
};

type StatusPayload = {
  overall: "green" | "yellow" | "red";
  checks: Check[];
  simulatedScenario?: "version_mismatch" | null;
};

type PreflightOutcome = {
  overall: StatusPayload["overall"];
  failingChecks: Check[];
  reason: string | null;
};

type TransferResult = {
  ok: true;
  txId: string;
  from: Account;
  to: Account;
  amount: number;
  mode: GuardrailsMode;
  timestamp: string;
};

const INITIAL_BALANCES: Record<Account, number> = {
  alice: 120,
  bob: 80,
};

function formatAmount(amount: number): string {
  return amount.toFixed(2);
}

function preflightOverallColor(overall: StatusPayload["overall"]): string {
  if (overall === "green") {
    return "text-green-700";
  }
  if (overall === "yellow") {
    return "text-amber-700";
  }
  return "text-red-700";
}

function isStatusPayload(value: unknown): value is StatusPayload {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const candidate = value as { overall?: unknown; checks?: unknown };
  return (
    (candidate.overall === "green" ||
      candidate.overall === "yellow" ||
      candidate.overall === "red") &&
    Array.isArray(candidate.checks)
  );
}

function isTransferResult(value: unknown): value is TransferResult {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    candidate.ok === true &&
    typeof candidate.txId === "string" &&
    (candidate.from === "alice" || candidate.from === "bob") &&
    (candidate.to === "alice" || candidate.to === "bob") &&
    typeof candidate.amount === "number" &&
    (candidate.mode === "enforced" || candidate.mode === "bypass") &&
    typeof candidate.timestamp === "string"
  );
}

function getFailingChecks(status: StatusPayload | null): Check[] {
  if (!status) {
    return [];
  }

  return status.checks.filter((check) => check.status === "fail");
}

function describeFailureReason(failingChecks: Check[], fallbackReason: string): string {
  const [firstFailingCheck] = failingChecks;
  if (!firstFailingCheck) {
    return fallbackReason;
  }

  return firstFailingCheck.details
    ? `${firstFailingCheck.name} (${firstFailingCheck.details})`
    : firstFailingCheck.name;
}

async function readStatusFromStatusJson(): Promise<StatusPayload | null> {
  try {
    const response = await fetch("/status.json", { cache: "no-store" });
    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as unknown;
    if (!isStatusPayload(payload)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export default function TransferPage() {
  const [balances, setBalances] = useState(INITIAL_BALANCES);
  const [amountInput, setAmountInput] = useState("10");
  const [simulateMismatch, setSimulateMismatch] = useState(true);
  const [mode, setMode] = useState<GuardrailsMode>(readGuardrailsModeFromStorage);
  const [sending, setSending] = useState(false);
  const [runningPreflight, setRunningPreflight] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendLocked, setSendLocked] = useState(false);
  const [lastPreflightOverall, setLastPreflightOverall] = useState<
    StatusPayload["overall"] | null
  >(null);
  const [preflightFailureReason, setPreflightFailureReason] = useState<string | null>(
    null,
  );
  const [failingChecks, setFailingChecks] = useState<Check[]>([]);
  const [simulatedMismatchActive, setSimulatedMismatchActive] = useState(false);
  const [txResult, setTxResult] = useState<TransferResult | null>(null);

  function updateMode(nextMode: GuardrailsMode) {
    setMode(nextMode);
    writeGuardrailsModeToStorage(nextMode);

    if (nextMode === "bypass") {
      setSendLocked(false);
    }
  }

  async function runPreflightForMode(currentMode: GuardrailsMode): Promise<PreflightOutcome> {
    const params = new URLSearchParams();
    params.set("mode", currentMode);

    if (simulateMismatch) {
      params.set("simulate", "version_mismatch");
    }

    const endpoint = `/api/preflight?${params.toString()}`;

    let preflightResponse: Response;
    try {
      preflightResponse = await fetch(endpoint, {
        method: "POST",
      });
    } catch {
      const reason = "Unable to reach preflight service.";
      setLastPreflightOverall("red");
      setFailingChecks([]);
      setPreflightFailureReason(reason);
      setSimulatedMismatchActive(false);
      return {
        overall: "red",
        failingChecks: [],
        reason,
      };
    }

    const preflightBody = (await preflightResponse
      .json()
      .catch(() => null)) as unknown;
    const preflightStatus = isStatusPayload(preflightBody) ? preflightBody : null;
    const latestStatus = await readStatusFromStatusJson();
    const resolvedStatus = latestStatus ?? preflightStatus;

    const resolvedFailingChecks = getFailingChecks(resolvedStatus);
    const overall = !preflightResponse.ok ? "red" : resolvedStatus?.overall ?? "red";

    const fallbackReason = !preflightResponse.ok
      ? `preflight returned ${preflightResponse.status}`
      : resolvedStatus === null
        ? "Preflight did not return a valid status payload."
        : "One or more guardrail checks failed.";

    const reason =
      overall === "red"
        ? describeFailureReason(resolvedFailingChecks, fallbackReason)
        : null;

    setLastPreflightOverall(overall);
    setFailingChecks(resolvedFailingChecks);
    setPreflightFailureReason(reason);
    setSimulatedMismatchActive(
      resolvedStatus?.simulatedScenario === "version_mismatch",
    );

    return {
      overall,
      failingChecks: resolvedFailingChecks,
      reason,
    };
  }

  async function rerunPreflight() {
    setRunningPreflight(true);
    setError(null);
    setTxResult(null);

    try {
      const preflight = await runPreflightForMode(mode);

      if (mode === "enforced" && preflight.overall === "red") {
        setSendLocked(true);
        return;
      }

      setSendLocked(false);
    } catch (preflightError) {
      const message =
        preflightError instanceof Error ? preflightError.message : "Unknown error";
      setError(message);
    } finally {
      setRunningPreflight(false);
    }
  }

  async function sendTransfer() {
    const amount = Number(amountInput);
    setError(null);
    setTxResult(null);

    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid amount greater than 0.");
      return;
    }

    if (amount > balances.alice) {
      setError("Alice does not have enough balance for this transfer.");
      return;
    }

    setSending(true);

    try {
      const preflight = await runPreflightForMode(mode);

      if (mode === "enforced" && preflight.overall === "red") {
        setSendLocked(true);
        return;
      }

      setSendLocked(false);

      const transferResponse = await fetch("/api/transfer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "alice",
          to: "bob",
          amount,
          mode,
        }),
      });

      const transferPayload = (await transferResponse
        .json()
        .catch(() => null)) as unknown;
      if (!transferResponse.ok || !isTransferResult(transferPayload)) {
        const message =
          transferPayload !== null &&
          typeof transferPayload === "object" &&
          "error" in transferPayload &&
          typeof (transferPayload as { error?: unknown }).error === "string"
            ? (transferPayload as { error: string }).error
            : `Transfer API failed (${transferResponse.status})`;
        throw new Error(message);
      }

      setBalances((current) => ({
        alice: Number((current.alice - amount).toFixed(2)),
        bob: Number((current.bob + amount).toFixed(2)),
      }));
      setTxResult(transferPayload);
      setAmountInput("");
    } catch (sendError) {
      const message =
        sendError instanceof Error ? sendError.message : "Unknown error";
      setError(message);
    } finally {
      setSending(false);
    }
  }

  const bypassMode = mode === "bypass";
  const showBlockedInline =
    mode === "enforced" && sendLocked && lastPreflightOverall === "red";
  const showBypassFailureWarning = bypassMode && lastPreflightOverall === "red";
  const sendDisabled =
    sending || runningPreflight || (mode === "enforced" && sendLocked);

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto w-full max-w-5xl space-y-6 px-6 py-10">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">Transfer Demo</h1>
            <p className="text-sm text-zinc-700">
              Simulate a transfer from Alice to Bob with guardrails preflight enforcement.
            </p>
          </div>

          <GuardrailsToggle
            value={mode === "enforced"}
            onChange={(next) => updateMode(next ? "enforced" : "bypass")}
            label="Mode"
            onText="Enforced"
            offText="Bypass demo"
            allowed
            showDisabledHint={false}
          />
        </header>

        {bypassMode ? (
          <section className="rounded-2xl border-4 border-amber-500 bg-amber-100 p-6">
            <p className="text-lg font-bold uppercase tracking-wide text-amber-950">
              Guardrails Bypass Active
            </p>
            <p className="mt-2 font-semibold text-amber-900">
              Unsafe mode: FAIL checks will not block this action.
            </p>
            <p className="mt-2 text-sm text-amber-900">
              Use only for demos. Production must run in enforced mode.
            </p>
          </section>
        ) : null}

        {simulatedMismatchActive ? (
          <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            Simulated mismatch injected for demo.
          </div>
        ) : null}

        <label className="flex items-center gap-2 rounded border border-zinc-300 bg-zinc-50 p-3 text-sm text-zinc-800">
          <input
            type="checkbox"
            checked={simulateMismatch}
            onChange={(event) => setSimulateMismatch(event.target.checked)}
          />
          Simulate version mismatch (forces FAIL path for demo)
        </label>

        <section className="grid gap-4 md:grid-cols-2">
          <article className="rounded-2xl border border-zinc-200 bg-white p-6">
            <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">Account</p>
            <h2 className="mt-2 text-xl font-semibold text-zinc-950">Alice</h2>
            <p className="mt-3 text-sm text-zinc-600">Starting sender wallet</p>
            <p className="mt-2 text-3xl font-semibold text-zinc-900">
              {formatAmount(balances.alice)} XRP
            </p>
          </article>

          <article className="rounded-2xl border border-zinc-200 bg-white p-6">
            <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">Account</p>
            <h2 className="mt-2 text-xl font-semibold text-zinc-950">Bob</h2>
            <p className="mt-3 text-sm text-zinc-600">Receiving wallet</p>
            <p className="mt-2 text-3xl font-semibold text-zinc-900">
              {formatAmount(balances.bob)} XRP
            </p>
          </article>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6">
          <label htmlFor="amount" className="block text-sm font-medium text-zinc-700">
            Amount
          </label>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
            <input
              id="amount"
              type="number"
              min="0.01"
              step="0.01"
              value={amountInput}
              onChange={(event) => setAmountInput(event.target.value)}
              placeholder="10"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 outline-none ring-zinc-300 focus:ring-2 sm:max-w-xs"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  void sendTransfer();
                }}
                disabled={sendDisabled}
                className="rounded-lg border border-zinc-300 px-4 py-2 font-medium text-zinc-900 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sending ? "Sending..." : "Send"}
              </button>
              <button
                type="button"
                onClick={() => {
                  void rerunPreflight();
                }}
                disabled={sending || runningPreflight}
                className="rounded-lg border border-zinc-300 px-4 py-2 font-medium text-zinc-900 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {runningPreflight ? "Running preflight..." : "Re-run preflight"}
              </button>
            </div>
          </div>

          {showBlockedInline ? (
            <div className="mt-3 rounded-xl border-2 border-red-400 bg-red-50 p-4">
              <p className="text-sm font-semibold text-red-800">
                Blocked by guardrails: {preflightFailureReason ?? "Preflight returned red."}
              </p>
              {failingChecks.length > 0 ? (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-900">
                  {failingChecks.map((check, index) => (
                    <li key={`${check.name}-${index}`}>
                      <span className="font-medium">{check.name}</span>
                      {check.details ? ` (${check.details})` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-red-900">
                  No failing checks were returned by /status.json.
                </p>
              )}
            </div>
          ) : null}

          {showBypassFailureWarning ? (
            <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-900">
                Preflight is RED and bypass is active: {preflightFailureReason ?? "Unsafe state."}
              </p>
              {failingChecks.length > 0 ? (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
                  {failingChecks.map((check, index) => (
                    <li key={`${check.name}-${index}`}>
                      <span className="font-medium">{check.name}</span>
                      {check.details ? ` (${check.details})` : ""}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {lastPreflightOverall ? (
            <p className="mt-3 text-xs text-zinc-600">
              Last preflight overall:{" "}
              <span className={`font-semibold ${preflightOverallColor(lastPreflightOverall)}`}>
                {lastPreflightOverall.toUpperCase()}
              </span>
            </p>
          ) : null}

          <p className="mt-3 text-xs text-zinc-500">
            Demo only: no real XRPL signing or transaction broadcasting.
          </p>
        </section>

        {error ? (
          <section className="rounded-2xl border border-red-300 bg-red-50 p-4">
            <p className="font-semibold text-red-800">{error}</p>
          </section>
        ) : null}

        {txResult ? (
          <section className="rounded-2xl border border-green-300 bg-green-50 p-4">
            <p className="font-semibold text-green-800">Transfer complete</p>
            <p className="mt-1 text-sm text-green-900">
              {txResult.from} sent {formatAmount(txResult.amount)} XRP to {txResult.to}.
            </p>
            <p className="mt-1 text-sm text-green-900">
              txId: <code>{txResult.txId}</code>
            </p>
          </section>
        ) : null}
      </div>
    </main>
  );
}
