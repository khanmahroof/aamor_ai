"use client";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import type { SettingsInput } from "@/lib/validation/settings";
import { api } from "@/lib/client-api";
import { sseData } from "@/lib/ai/streams";
import type { Model, Usage } from "@/lib/ai/types";
import type {
  ConversationView,
  MessageView,
  AttachmentView,
} from "@/lib/ui-types";
export function useChatController() {
  const [models, setModels] = useState<Model[]>([]);
  const [model, setModel] = useState("");
  const [conversation, setConversation] = useState<ConversationView | null>(
    null,
  );
  const [history, setHistory] = useState<ConversationView[]>([]);
  const [query, setQuery] = useState("");
  const [moreHistory, setMoreHistory] = useState(false);
  const [moreMessages, setMoreMessages] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [switching, setSwitching] = useState(false);
  const historyRequest = useRef(0);
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<AttachmentView[]>([]);
  const [uploading, setUploading] = useState(false);
  async function upload(file: File) {
    if (attachments.length >= 3) {
      setError("Attach up to three files per message.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const saved = await api<AttachmentView>("/api/uploads", {
        method: "POST",
        body: form,
      });
      setAttachments((previous) => [...previous, saved]);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }
  async function removeAttachment(id: string) {
    try {
      await api(`/api/files/${id}`, { method: "DELETE" });
      setAttachments((previous) => previous.filter((file) => file.id !== id));
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not remove attachment.",
      );
    }
  }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [stopping, setStopping] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sidebar, setSidebar] = useState(false);
  const [dark, setDark] = useState(false);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const feed = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const loadHistory = useCallback(
    async (skip = 0) => {
      const requestId = ++historyRequest.current;
      try {
        const data = await api<{ items: ConversationView[]; hasMore: boolean }>(
          `/api/conversations?q=${encodeURIComponent(query)}&skip=${skip}`,
        );
        if (requestId !== historyRequest.current) return;
        setHistory((old) => (skip ? [...old, ...data.items] : data.items));
        setMoreHistory(data.hasMore);
      } catch (error) {
        setError(
          error instanceof Error ? error.message : "Could not load history.",
        );
      }
    },
    [query],
  );
  useEffect(() => {
    const timer = setTimeout(() => void loadHistory(), 200);
    return () => clearTimeout(timer);
  }, [loadHistory]);
  async function selectConversation(item: ConversationView, older = false) {
    if (busy || switching || stopping || uploading) return;
    setSwitching(true);
    setError("");
    try {
      const data = await api<{
        conversation: ConversationView;
        messages: MessageView[];
        hasMore: boolean;
      }>(
        `/api/conversations/${item.id}${older ? `?before=${messages[0]?.position ?? 0}` : ""}`,
      );
      follow.current = !older;
      setConversation(data.conversation);
      setMessages((previous) =>
        older ? [...data.messages, ...previous] : data.messages,
      );
      setMoreMessages(data.hasMore);
      if (!older) {
        setDraft("");
        setUsage(null);
        setSidebar(false);
        if (data.conversation.selectedModel)
          setModel(data.conversation.selectedModel);
      }
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not open conversation.",
      );
    } finally {
      setSwitching(false);
    }
  }
  async function renameConversation(item: ConversationView) {
    const title = window.prompt("Conversation title", item.title);
    if (!title?.trim()) return;
    try {
      const updated = await api<ConversationView>(
        `/api/conversations/${item.id}`,
        { method: "PATCH", body: JSON.stringify({ title: title.trim() }) },
      );
      if (conversation?.id === item.id) setConversation(updated);
      await loadHistory();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not rename conversation.",
      );
    }
  }
  async function deleteConversation(item: ConversationView) {
    if (
      !window.confirm(
        `Delete “${item.title}” and its messages? This cannot be undone.`,
      )
    )
      return;
    try {
      await api(`/api/conversations/${item.id}`, { method: "DELETE" });
      if (conversation?.id === item.id) newChat();
      await loadHistory();
      setNotice("Conversation deleted.");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not delete conversation.",
      );
    }
  }
  const refreshModels = useCallback(async () => {
    try {
      const [data, preferences] = await Promise.all([
        api<{ models: Model[]; warnings: string[]; defaultProvider: string }>(
          "/api/models?refresh=1",
        ),
        api<SettingsInput>("/api/settings"),
      ]);
      setModels(data.models);
      setModel((previous) =>
        data.models.some((m) => m.id === previous)
          ? previous
          : data.models.find((m) => m.id === preferences.preferredModel)?.id ||
            data.models.find(
              (m) =>
                m.provider ===
                (preferences.preferredProvider || data.defaultProvider),
            )?.id ||
            data.models[0]?.id ||
            "",
      );
      const isDark =
        preferences.theme === "dark" ||
        (preferences.theme === "system" &&
          window.matchMedia("(prefers-color-scheme: dark)").matches);
      setDark(isDark);
      document.documentElement.dataset.theme = isDark ? "dark" : "light";
      setNotice(data.warnings.join(" "));
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not load models.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void refreshModels(), 0);
    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [refreshModels]);
  useEffect(() => {
    if (follow.current && feed.current)
      feed.current.scrollTop = feed.current.scrollHeight;
  }, [messages]);
  function newChat() {
    if (busy || switching || stopping || uploading) return;
    setConversation(null);
    setMessages([]);
    setMoreMessages(false);
    setDraft("");
    setUsage(null);
    setError("");
    setSidebar(false);
  }
  const shortcut = useEffectEvent((event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      newChat();
      document
        .querySelector<HTMLTextAreaElement>(".composer textarea")
        ?.focus();
    }
    if (
      event.key === "/" &&
      !(event.target instanceof HTMLInputElement) &&
      !(event.target instanceof HTMLTextAreaElement)
    ) {
      event.preventDefault();
      setCollapsed(false);
      setSidebar(true);
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLInputElement>(".history-search input")
          ?.focus(),
      );
    }
    if (event.key === "Escape") setSidebar(false);
  });
  useEffect(() => {
    const handler = (event: KeyboardEvent) => shortcut(event);
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);
  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    void api("/api/settings", {
      method: "PATCH",
      body: JSON.stringify({ theme: next ? "dark" : "light" }),
    }).catch(() => setNotice("Theme could not be saved."));
  }
  async function send(retry?: {
    action: "retry" | "edit";
    messageId: string;
    content?: string;
  }) {
    if (
      busy ||
      stopping ||
      switching ||
      uploading ||
      (!retry && !draft.trim() && !attachments.length) ||
      !model
    )
      return;
    const content =
      retry?.content ??
      (draft.trim() || "Please help me understand these attachments.");
    setBusy(true);
    setError("");
    if (!retry) setDraft("");
    setUsage(null);
    follow.current = true;
    const abort = new AbortController();
    abortRef.current = abort;
    let started = false;
    try {
      const current =
        conversation ??
        (await api<ConversationView>("/api/conversations", { method: "POST" }));
      setConversation(current);
      const response = await fetch("/api/chat", {
        method: "POST",
        signal: abort.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: current.id,
          model,
          action: retry?.action ?? "send",
          messageId: retry?.messageId,
          messages:
            retry?.action === "retry" ? [] : [{ role: "user", content }],
          attachments: retry ? [] : attachments.map((file) => file.id),
        }),
      });
      if (!response.ok) throw new Error((await response.json()).error);
      if (!response.body) throw new Error("No response received.");
      let assistantId = "";
      let finished = false;
      for await (const raw of sseData(response.body)) {
        const event = JSON.parse(raw);
        if (event.type === "start") {
          started = true;
          if (!retry) setAttachments([]);
          assistantId = event.assistantId;
          setMessages((previous) => [
            ...previous.filter((m) => m.position < event.userMessage.position),
            event.userMessage,
            {
              id: assistantId,
              role: "assistant",
              content: "",
              position: event.userMessage.position + 1,
              model,
            },
          ]);
          if (current.title === "New chat")
            setConversation({ ...current, title: content.slice(0, 64) });
        }
        if (event.type === "text")
          setMessages((previous) =>
            previous.map((m) =>
              m.id === assistantId
                ? { ...m, content: m.content + event.text }
                : m,
            ),
          );
        if (event.type === "error") setError(event.error);
        if (event.type === "done") {
          finished = true;
          setUsage(event.usage);
          setMessages((previous) =>
            previous.map((m) =>
              m.id === assistantId ? { ...m, status: event.status } : m,
            ),
          );
        }
      }
      if (!finished)
        throw new Error(
          "Stream interrupted. Your saved messages remain in this conversation.",
        );
    } catch (error) {
      if (abort.signal.aborted) setNotice("Generation stopped.");
      else
        setError(
          error instanceof Error
            ? error.message
            : "Network error. Please retry.",
        );
      if (!started && !retry) setDraft(content);
    } finally {
      setBusy(false);
      abortRef.current = null;
      void loadHistory();
    }
  }
  async function stop() {
    if (stopping) return;
    setStopping(true);
    abortRef.current?.abort();
    if (!conversation) {
      setStopping(false);
      return;
    }
    try {
      await api("/api/chat/stop", {
        method: "POST",
        body: JSON.stringify({ conversationId: conversation.id }),
      });
      const data = await api<{ messages: MessageView[] }>(
        `/api/conversations/${conversation.id}`,
      );
      setMessages(data.messages);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not confirm the saved response.",
      );
    } finally {
      setStopping(false);
    }
  }
  function onFeedScroll() {
    const el = feed.current;
    if (el) {
      follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
      setAtBottom(follow.current);
    }
  }
  function scrollToLatest() {
    follow.current = true;
    feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: "smooth" });
  }
  const selected = models.find((m) => m.id === model);
  return {
    sidebar,
    setSidebar,
    collapsed,
    setCollapsed,
    newChat,
    busy,
    switching,
    stopping,
    uploading,
    history,
    query,
    setQuery,
    selectConversation,
    renameConversation,
    deleteConversation,
    conversation,
    moreHistory,
    loadHistory,
    refreshModels,
    model,
    setModel,
    models,
    loading,
    selected,
    toggleTheme,
    dark,
    feed,
    onFeedScroll,
    scrollToLatest,
    messages,
    moreMessages,
    setDraft,
    setNotice,
    send,
    atBottom,
    error,
    setError,
    notice,
    usage,
    attachments,
    removeAttachment,
    upload,
    draft,
    stop,
  };
}
