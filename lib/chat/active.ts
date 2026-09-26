type Active = { abort: AbortController; finished: Promise<void> };
const state = globalThis as unknown as {
  aamorGenerations?: Map<string, Active>;
};
export const activeGenerations = (state.aamorGenerations ??= new Map<
  string,
  Active
>());
