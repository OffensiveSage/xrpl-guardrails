"use client";

function isBypassAllowed(): boolean {
  const allowBypass = process.env.NEXT_PUBLIC_DEMO_ALLOW_BYPASS === "true";
  const isProduction = process.env.NODE_ENV === "production";
  return allowBypass && !isProduction;
}

type GuardrailsToggleProps = {
  value: boolean;
  onChange: (next: boolean) => void;
};

export default function GuardrailsToggle({ value, onChange }: GuardrailsToggleProps) {
  const allowed = isBypassAllowed();

  const handleToggle = () => {
    if (allowed) {
      onChange(!value);
    }
  };

  return (
    <div className="flex items-center gap-3 rounded border border-zinc-300 bg-zinc-50 px-4 py-2">
      <span className="text-sm font-medium text-zinc-700">Guardrails</span>
      <button
        type="button"
        onClick={handleToggle}
        disabled={!allowed}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          allowed ? "cursor-pointer" : "cursor-not-allowed opacity-50"
        } ${value ? "bg-green-600" : "bg-red-500"}`}
        aria-label={value ? "Guardrails ON" : "Guardrails OFF"}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            value ? "translate-x-1" : "translate-x-6"
          }`}
        />
      </button>
      <span className={`text-sm font-medium ${value ? "text-green-700" : "text-red-600"}`}>
        {value ? "ON" : "OFF"}
      </span>
      {!allowed && (
        <span className="text-xs text-zinc-500">(Bypass disabled)</span>
      )}
    </div>
  );
}
