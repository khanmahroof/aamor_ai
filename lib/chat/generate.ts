import "server-only";
import { getDatabase } from "../db/client";
import { ownedConversation } from "../db/conversations";
import { resolveModel } from "../ai/registry";
import { buildContext, estimateTokens } from "../ai/context";
import { AppError, envNumber } from "../http";
import { limiter } from "../rate-limit";
import type { Usage } from "../ai/types";
import type { z } from "zod";
import type { chatSchema } from "../validation/chat";
import { activeGenerations } from "./active";
import { withAttachments } from "../files/context";
import { removeFile } from "../files/storage";

export async function generateChat(
  userId: string,
  input: z.infer<typeof chatSchema>,
  request: Request,
) {
  const conversation = await ownedConversation(userId, input.conversationId);
  limiter.consume(`chat:${userId}`, envNumber("CHAT_RATE_LIMIT", 20, 1, 1000));
  const releaseUser = limiter.acquire(
    `user:${userId}`,
    envNumber("CHAT_CONCURRENT_LIMIT", 1, 1, 4),
  );
  let releaseConversation: (() => void) | undefined;
  try {
    releaseConversation = limiter.acquire(`conversation:${conversation.id}`);
    const { model, provider } = await resolveModel(input.model);
    const db = getDatabase();
    const settings = await db.userSettings.findUnique({ where: { userId } });
    const target =
      input.action === "send"
        ? null
        : await db.message.findFirst({
            where: {
              id: input.messageId,
              conversationId: conversation.id,
              role: "user",
            },
            include: { attachments: true },
          });
    if (input.action !== "send" && !target)
      throw new AppError(404, "Message not found.");
    if (
      input.action === "retry" &&
      target &&
      (await db.message.count({
        where: {
          conversationId: conversation.id,
          role: "user",
          position: { gt: target.position },
        },
      }))
    )
      throw new AppError(
        409,
        "Only the latest response can be regenerated. Edit an earlier message to start again from there.",
      );
    const history = (
      await db.message.findMany({
        where: {
          conversationId: conversation.id,
          ...(target ? { position: { lt: target.position } } : {}),
        },
        orderBy: { position: "desc" },
        take: 40,
        include: { attachments: true },
      })
    ).reverse();
    const pending = await db.pendingUpload.findMany({
      where: { id: { in: input.attachments }, userId },
    });
    if (pending.length !== input.attachments.length)
      throw new AppError(404, "Attachment not found or already used.");
    const files = target?.attachments ?? pending;
    const content =
      input.action === "retry" ? target!.content : input.messages[0].content;
    const maxTokens = Math.min(
      envNumber("MAX_OUTPUT_TOKENS", 2048, 128, 8192),
      Math.floor(model.contextWindow / 3),
    );
    const currentMessage = await withAttachments(content, files, model.vision);
    // Retain only recent images within a conservative image budget.
    let imageSlots = Math.max(
      0,
      (model.contextWindow >= 8192 ? 2 : 1) -
        (currentMessage.images?.length ?? 0),
    );
    const previousMessages = (
      await Promise.all(
        [...history].reverse().map(async (m) => {
          if (m.role !== "user") return { role: m.role, content: m.content };
          let omitted = false;
          const contextFiles = m.attachments.filter((file) => {
            if (!file.mimeType.startsWith("image/")) return true;
            if (model.vision && imageSlots > 0) {
              imageSlots--;
              return true;
            }
            omitted = true;
            return false;
          });
          return withAttachments(
            m.content +
              (omitted
                ? "\n[An earlier image is omitted to respect the current model/context limit.]"
                : ""),
            contextFiles,
            model.vision,
          );
        }),
      )
    ).reverse();
    const context = buildContext(
      [...previousMessages, currentMessage],
      settings?.systemPrompt ?? "",
      model.contextWindow,
      maxTokens,
    );
    const removedFiles = target
      ? await db.attachment.findMany({
          where: {
            message: {
              conversationId: conversation.id,
              position: { gt: target.position },
            },
          },
          select: { storagePath: true },
        })
      : [];
    const position = target?.position ?? (history.at(-1)?.position ?? -1) + 1;
    const saved = await db.$transaction(async (tx) => {
      if (target)
        await tx.message.deleteMany({
          where: {
            conversationId: conversation.id,
            position: { gt: target.position },
          },
        });
      const userMessage = target
        ? await tx.message.update({
            where: { id: target.id },
            data: { content },
          })
        : await tx.message.create({
            data: {
              conversationId: conversation.id,
              role: "user",
              content,
              position,
            },
          });
      for (const file of pending) {
        await tx.pendingUpload.delete({ where: { id: file.id, userId } });
        await tx.attachment.create({
          data: {
            id: file.id,
            messageId: userMessage.id,
            filename: file.filename,
            mimeType: file.mimeType,
            size: file.size,
            storagePath: file.storagePath,
            extractedText: file.extractedText,
          },
        });
      }
      const assistant = await tx.message.create({
        data: {
          conversationId: conversation.id,
          role: "assistant",
          content: "",
          position: position + 1,
          status: "interrupted",
          model: model.id,
        },
      });
      await tx.conversation.update({
        where: { id: conversation.id, userId },
        data: {
          selectedModel: model.id,
          updatedAt: new Date(),
          ...(conversation.title === "New chat"
            ? { title: content.replace(/\s+/g, " ").slice(0, 64) }
            : {}),
        },
      });
      return {
        userMessage: {
          ...userMessage,
          attachments: files.map(({ id, filename, mimeType, size }) => ({
            id,
            filename,
            mimeType,
            size,
          })),
        },
        assistant,
      };
    });
    await Promise.all(
      removedFiles.map((file) => removeFile(file.storagePath).catch(() => {})),
    );
    const abort = new AbortController();
    let timedOut = false;
    let finish!: () => void;
    activeGenerations.set(conversation.id, {
      abort,
      finished: new Promise<void>((resolve) => {
        finish = resolve;
      }),
    });
    const onAbort = () => abort.abort();
    request.signal.addEventListener("abort", onAbort, { once: true });
    if (request.signal.aborted) abort.abort();
    const timer = setTimeout(
      () => {
        timedOut = true;
        abort.abort();
      },
      envNumber("CHAT_TIMEOUT_MS", 120000, 5000, 600000),
    );
    let disconnected = false;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit = (data: unknown) => {
          if (!disconnected) {
            try {
              controller.enqueue(
                new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`),
              );
            } catch {
              disconnected = true;
              abort.abort();
            }
          }
        };
        let text = "";
        let usage: Usage | undefined;
        let status: "completed" | "interrupted" | "failed" = "completed";
        let errorMessage = "";
        let lastSaved = Date.now();
        emit({
          type: "start",
          conversationId: conversation.id,
          userMessage: saved.userMessage,
          assistantId: saved.assistant.id,
        });
        try {
          for await (const event of provider.stream({
            model,
            messages: context,
            temperature: settings?.temperature ?? 0.7,
            maxTokens,
            signal: abort.signal,
          })) {
            if (event.type === "text") {
              text += event.text;
              if (text.length > 128000)
                throw new AppError(502, "Response reached the maximum size.");
              emit({ type: "text", text: event.text });
              if (Date.now() - lastSaved > 1000) {
                await db.message.update({
                  where: { id: saved.assistant.id },
                  data: { content: text },
                });
                lastSaved = Date.now();
              }
            }
            if (event.type === "usage") usage = event.usage;
          }
          if (abort.signal.aborted) throw new Error("Cancelled");
          if (!text.trim())
            throw new AppError(
              502,
              "The model returned an empty response. Try another model or retry.",
            );
        } catch (error) {
          status = abort.signal.aborted ? "interrupted" : "failed";
          errorMessage = timedOut
            ? "The model timed out. Your partial response was saved."
            : abort.signal.aborted
              ? "Generation stopped. Your partial response was saved."
              : error instanceof AppError
                ? error.message
                : "The response was interrupted. Please retry.";
        } finally {
          clearTimeout(timer);
          request.signal.removeEventListener("abort", onAbort);
          usage ??= {
            inputTokens: context.reduce(
              (n, m) =>
                n + estimateTokens(m.content) + (m.images?.length ?? 0) * 2048,
              0,
            ),
            outputTokens: estimateTokens(text),
            totalTokens: 0,
            estimated: true,
          };
          usage.totalTokens = usage.inputTokens + usage.outputTokens;
          try {
            await db.$transaction([
              db.message.update({
                where: { id: saved.assistant.id },
                data: { content: text, status },
              }),
              db.usageRecord.create({
                data: {
                  userId,
                  conversationId: conversation.id,
                  model: model.name,
                  provider: model.provider,
                  ...usage,
                },
              }),
              db.conversation.update({
                where: { id: conversation.id, userId },
                data: { updatedAt: new Date() },
              }),
            ]);
            if (errorMessage) emit({ type: "error", error: errorMessage });
            emit({
              type: "done",
              assistantId: saved.assistant.id,
              status,
              usage,
            });
          } catch {
            emit({
              type: "error",
              error:
                "Could not save the response. Reload this conversation before retrying.",
            });
          } finally {
            activeGenerations.delete(conversation.id);
            finish();
            releaseConversation?.();
            releaseUser();
            if (!disconnected) {
              try {
                controller.close();
              } catch {}
            }
          }
        }
      },
      cancel() {
        disconnected = true;
        abort.abort();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    releaseConversation?.();
    releaseUser();
    throw error;
  }
}
