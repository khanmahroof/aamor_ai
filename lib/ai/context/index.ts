import type { AIMessage } from "../types";
import { AppError } from "../../http";
export const estimateTokens = (text: string) =>
  Math.ceil(new TextEncoder().encode(text).length / 3);
// Bytes form a conservative bound for text; reserve extra space for image tokens.
const cost = (m: AIMessage) =>
  new TextEncoder().encode(m.content).length +
  16 +
  (m.images?.length ?? 0) * 2048;
export function buildContext(
  messages: AIMessage[],
  system: string,
  contextWindow: number,
  outputTokens: number,
) {
  const instruction: AIMessage = {
    role: "system",
    content:
      system ||
      "You are Aamor, a helpful and careful assistant. Be clear about uncertainty.",
  };
  let budget = contextWindow - outputTokens - 256 - cost(instruction);
  if (budget < 256)
    throw new AppError(
      400,
      "Custom instructions are too long for this model. Shorten them in Settings.",
    );
  const selected: AIMessage[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role === "system") continue;
    if (cost(message) > budget) {
      if (!selected.length) {
        const imageCost = (message.images?.length ?? 0) * 2048;
        if (budget - imageCost < 128)
          throw new AppError(
            400,
            "The images exceed this model's context. Use fewer images or a larger model.",
          );
        // Trim on code-point boundaries; leaves the stored message intact.
        let text = "";
        let used = 0;
        for (const point of message.content) {
          used += new TextEncoder().encode(point).length;
          if (used > budget - imageCost - 80) break;
          text += point;
        }
        selected.unshift({
          ...message,
          content: text + "\n[Message truncated to fit context]",
        });
      }
      break;
    }
    selected.unshift(message);
    budget -= cost(message);
  }
  while (selected[0]?.role === "assistant") selected.shift();
  return [instruction, ...selected];
}
