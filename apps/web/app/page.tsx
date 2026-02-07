import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-12">
        <header className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">XRPL Guardrails</h1>
          <p className="max-w-2xl text-zinc-700">
            Preflight guardrails for XRPL workflows so risky dependency and audit issues are clear
            before sensitive actions run.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          <article className="rounded-2xl border border-zinc-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-zinc-950">Guardrails status</h2>
            <p className="mt-2 text-sm text-zinc-700">
              Inspect the current posture report or run the interactive preflight demo.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
                href="/dashboard"
              >
                Open dashboard
              </Link>
              <Link
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
                href="/demo"
              >
                Open demo
              </Link>
            </div>
          </article>

          <article className="rounded-2xl border border-zinc-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-zinc-950">Transfer demo</h2>
            <p className="mt-2 text-sm text-zinc-700">
              Simulate a transfer between demo accounts with enforced and bypass modes.
            </p>
            <div className="mt-5">
              <Link
                className="inline-flex rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
                href="/transfer"
              >
                Open transfer demo
              </Link>
            </div>
          </article>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6">
          <h2 className="text-base font-semibold text-zinc-950">Status meanings</h2>
          <div className="mt-3 space-y-2 text-sm text-zinc-700">
            <p>
              <span className="font-semibold text-green-700">PASS:</span> No policy violations were
              found and the check is healthy.
            </p>
            <p>
              <span className="font-semibold text-amber-700">WARN:</span> Non-blocking risk exists
              and should be reviewed before production use.
            </p>
            <p>
              <span className="font-semibold text-red-700">FAIL:</span> A blocking issue exists and
              enforced mode must stop sensitive actions.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
