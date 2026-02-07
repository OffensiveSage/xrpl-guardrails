export type GuardrailsMode = "enforced" | "bypass";

export const GUARDRAILS_MODE_STORAGE_KEY = "guardrails_mode";

export function isGuardrailsMode(value: unknown): value is GuardrailsMode {
  return value === "enforced" || value === "bypass";
}

export function normalizeGuardrailsMode(value: unknown): GuardrailsMode {
  return isGuardrailsMode(value) ? value : "enforced";
}

export function readGuardrailsModeFromStorage(): GuardrailsMode {
  if (typeof window === "undefined") {
    return "enforced";
  }

  return normalizeGuardrailsMode(
    window.localStorage.getItem(GUARDRAILS_MODE_STORAGE_KEY),
  );
}

export function writeGuardrailsModeToStorage(mode: GuardrailsMode): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(GUARDRAILS_MODE_STORAGE_KEY, mode);
}
