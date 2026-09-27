import type { Model, ProviderId } from "./types";

/** Explicit saved models survive refresh; unset/stale choices use server default. */
export function selectModel(
  models: Model[],
  previous: string,
  preferred: string | null,
  provider: ProviderId,
) {
  return (
    models.find((m) => m.id === previous)?.id ||
    models.find((m) => m.id === preferred)?.id ||
    models.find((m) => m.provider === provider)?.id ||
    models[0]?.id ||
    ""
  );
}
