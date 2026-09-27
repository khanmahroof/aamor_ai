import { resolveModel } from "@/lib/ai/registry";
import { buildContext } from "@/lib/ai/context";
import { AppError, checkOrigin, errorResponse, readJson } from "@/lib/http";
import { limiter } from "@/lib/rate-limit";
import { guestChatSchema } from "@/lib/validation/guest";
export const runtime = "nodejs";

export async function POST(request: Request) {
  let release: (() => void) | undefined;
  try {
    checkOrigin(request);
    // Global budgets cannot be bypassed by clearing cookies or spoofing IP headers.
    // These single-instance trial limits reset on restart; use shared limits to scale.
    limiter.consume("guest-chat-minute", 10);
    limiter.consume("guest-chat-hour", 100, 3600000);
    const input = guestChatSchema.parse(await readJson(request));
    release = limiter.acquire("guest-chat-active", 2);
    const { model, provider } = await resolveModel(input.model);
    const maxTokens = Math.min(1024, Math.floor(model.contextWindow / 3), model.maxOutputTokens ?? Infinity);
    const context = buildContext(input.messages, "", model.contextWindow, maxTokens);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    const signal = AbortSignal.any([request.signal, controller.signal]);
    const unlock = release;
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(stream) {
        const emit = (value: unknown) => stream.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`));
        try {
          let length = 0;
          for await (const event of provider.stream({ model, messages: context, temperature: 0.7, maxTokens, signal })) {
            if (event.type === "text") {
              length += event.text.length;
              if (length > 32000) throw new AppError(502, "Guest response exceeded its limit.");
            }
            emit(event);
          }
        } catch (error) {
          if (!request.signal.aborted && !signal.aborted) {
            try { emit({ type: "error", error: error instanceof AppError ? error.message : "The response failed. Please try again." }); } catch {}
          } else if (!request.signal.aborted) {
            try { emit({ type: "error", error: "The response timed out. Please try again." }); } catch {}
          }
        } finally {
          clearTimeout(timeout);
          controller.abort();
          unlock();
          try { stream.close(); } catch {}
        }
      },
      cancel() { controller.abort(); },
    });
    return new Response(body, { headers: {
      "Content-Type": "text/event-stream", "Cache-Control": "no-store", "X-Accel-Buffering": "no",
    } });
  } catch (error) {
    release?.();
    return errorResponse(error);
  }
}
