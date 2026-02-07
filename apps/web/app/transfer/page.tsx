"use client";

import { useState } from "react";
import GuardrailsToggle from "../components/GuardrailsToggle";

type GuardrailsMode = "enforced" | "bypass";

type Account = "alice" | "bob";

type Check = {
  name: string;
  status: "pass" | "warn" | "fail";
  details?: string;
};

type StatusPayload = {
  overall: "green" | "yellow" | "red";
  checks: Check[];
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
  const [mode, setMode] = useState<GuardrailsMode>("enforced");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockedByGuardrails, setBlockedByGuardrails] = useState(false);
  const [preflightFailed, setPreflightFailed] = useState(false);
  const [failingChecks, setFailingChecks] = useState<Check[]>([]);
  const [txResult, setTxResult] = useState<TransferResult | null>(null);

  async function sendTransfer() {
    const amount = Number(amountInput);
    setError(null);
    setBlockedByGuardrails(false);
    setPreflightFailed(false);
    setTxResult(null);
    setFailingChecks([]);

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
      const preflightParams = new URLSearchParams();
      if (mode === "bypass") {
        preflightParams.set("bypass", "1");
      }

      const simulate = new URLSearchParams(window.location.search).get("simulate");
      if (simulate === "version_mismatch") {
        preflightParams.set("simulate", "version_mismatch");
      }

      const preflightEndpoint =
        preflightParams.size > 0
          ? `/api/preflight?${preflightParams.toString()}`
          : "/api/preflight";
      
      let preflightResponse;
      try {
        preflightResponse = await fetch(preflightEndpoint, {
          method: "POST",
        });
      } catch (fetchError) {
        // Network or other fetch errors
        if (mode === "enforced") {
          setBlockedByGuardrails(true);
          setPreflightFailed(true);
          return;
        }
        throw fetchError;
      }

      const preflightBody = (await preflightResponse
        .json()
        .catch(() => null)) as unknown;
      const preflightStatus = isStatusPayload(preflightBody) ? preflightBody : null;
      const latestStatus = await readStatusFromStatusJson();
      const resolvedStatus = latestStatus ?? preflightStatus;
      setFailingChecks(getFailingChecks(resolvedStatus));

      const didPreflightFail =
        preflightResponse.status === 500 || resolvedStatus?.overall === "red";
      setPreflightFailed(didPreflightFail);

      const shouldBlockTransfer = mode === "enforced" && didPreflightFail;

      if (shouldBlockTransfer) {
        setBlockedByGuardrails(true);
        return;
      }

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
  const showBypassFailureWarning = bypassMode && preflightFailed;

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
            onChange={(next) => setMode(next ? "enforced" : "bypass")}
            label="Guardrails"
            allowed
            showDisabledHint={false}
          />
        </header>

        {bypassMode ? (
          <section className="rounded-xl border-2 border-amber-500 bg-amber-50 p-4">
            <p className="font-semibold text-amber-900">
              Guardrails bypass enabled for demo. Unsafe: FAIL will not block actions.
            </p>
            <p className="mt-1 text-sm text-amber-800">
              This mode is only for demos. In production, bypass is disabled.
            </p>
          </section>
        ) : null}

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
            <button
              type="button"
              onClick={() => {
                void sendTransfer();
              }}
              disabled={sending}
              className="rounded-lg border border-zinc-300 px-4 py-2 font-medium text-zinc-900 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
          {blockedByGuardrails ? (
            <p className="mt-2 text-sm font-semibold text-red-700">Not allowed.</p>
          ) : null}
          <p className="mt-3 text-xs text-zinc-500">
            Demo only: no real XRPL signing or transaction broadcasting.
          </p>
        </section>

        {blockedByGuardrails ? (
          <section className="rounded-2xl border-2 border-red-400 bg-red-50 p-5">
            <h3 className="text-lg font-semibold text-red-900">
              Blocked by guardrails
            </h3>
            <div className="mt-3">
              <p className="text-sm font-medium text-red-800">Failing checks:</p>
              {failingChecks.length > 0 ? (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-900">
                  {failingChecks.map((check, index) => (
                    <li key={`${check.name}-${index}`}>
                      <span className="font-medium">{check.name}</span>
                      {check.details ? ` — ${check.details}` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-red-900">
                  Preflight check failed or returned an error.
                </p>
              )}
            </div>
            <p className="mt-4 text-sm text-red-800">
              <strong>Fail closed:</strong> Enforced mode blocks actions on any FAIL.
            </p>
          </section>
        ) : null}

        {error ? (
          <section className="rounded-2xl border border-red-300 bg-red-50 p-4">
            <p className="font-semibold text-red-800">{error}</p>
          </section>
        ) : null}

        {showBypassFailureWarning ? (
          <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
            <p className="font-medium text-amber-900">
              This would have been blocked in Enforced mode.
            </p>
            {failingChecks.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
                {failingChecks.map((check, index) => (
                  <li key={`${check.name}-${index}`}>
                    {check.name}
                    {check.details ? ` (${check.details})` : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-amber-900">
                No failing checks were returned by /status.json.
              </p>
            )}
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
