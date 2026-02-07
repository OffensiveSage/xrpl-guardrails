"use client";

function isBypassAllowed(): boolean {
  const allowBypass = process.env.NEXT_PUBLIC_DEMO_ALLOW_BYPASS === "true";
  const isProduction = process.env.NODE_ENV === "production";
  return allowBypass && !isProduction;
}

type GuardrailsToggleProps = {
  value: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  onText?: string;
  offText?: string;
  allowed?: boolean;
  showDisabledHint?: boolean;
};

export default function GuardrailsToggle({
  value,
  onChange,
  label = "Guardrails",
  onText = "ON",
  offText = "OFF",
  allowed,
  showDisabledHint = true,
}: GuardrailsToggleProps) {
  const bypassAllowed = allowed ?? isBypassAllowed();

  const handleToggle = () => {
    if (bypassAllowed) {
      onChange(!value);
    }
  };

  return (
    <div className="flex items-center gap-3 rounded border border-zinc-300 bg-zinc-50 px-4 py-2">
      <span className="text-sm font-medium text-zinc-700">{label}</span>
      <button
        type="button"
        onClick={handleToggle}
        disabled={!bypassAllowed}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          bypassAllowed ? "cursor-pointer" : "cursor-not-allowed opacity-50"
        } ${value ? "bg-green-600" : "bg-red-500"}`}
        aria-label={value ? onText : offText}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            value ? "translate-x-1" : "translate-x-6"
          }`}
        />
      </button>
      <span className={`text-sm font-medium ${value ? "text-green-700" : "text-red-600"}`}>
        {value ? onText : offText}
      </span>
      {!bypassAllowed && showDisabledHint && (
        <span className="text-xs text-zinc-500">(Bypass disabled)</span>
      )}
    </div>
  );
}
