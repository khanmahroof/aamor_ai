"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Model } from "@/lib/ai/types";
import { sseData } from "@/lib/ai/streams";
import { Composer } from "./composer";
import { Markdown } from "./markdown";

type Message = { role: "user" | "assistant"; content: string };
async function loadModels(signal?: AbortSignal): Promise<{ models: Model[]; warnings: string[] }> {
  const response = await fetch("/api/guest/models", { signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Models could not be loaded.");
  return data;
}

export function GuestChat() {
  const [models, setModels] = useState<Model[]>([]);
  const [model, setModel] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const active = useRef<AbortController | null>(null);
  const latest = useRef<HTMLDivElement>(null);

  const applyModels = useCallback((data: { models: Model[]; warnings: string[] }) => {
    setModels(data.models);
    setModel((previous) => data.models.some((m) => m.id === previous) ? previous : data.models[0]?.id ?? "");
    setError(data.warnings.join(" "));
    setLoading(false);
  }, []);
  const modelError = useCallback((error: unknown) => {
    setError(error instanceof Error ? error.message : "Models could not be loaded.");
    setLoading(false);
  }, []);
  function refreshModels() {
    setLoading(true);
    setError("");
    void loadModels().then(applyModels).catch(modelError);
  }
  useEffect(() => {
    const controller = new AbortController();
    void loadModels(controller.signal).then((data) => {
      if (!controller.signal.aborted) applyModels(data);
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) modelError(error);
    });
    return () => { controller.abort(); active.current?.abort(); };
  }, [applyModels, modelError]);
  useEffect(() => { latest.current?.scrollIntoView({ block: "end" }); }, [messages]);

  async function send() {
    if (active.current || !draft.trim() || !model) return;
    const content = draft.trim();
    if (content.length > 8000) { setError("Guest messages can contain up to 8,000 characters."); return; }
    const history = [...messages.filter((m) => m.content).slice(-18).map((m) => ({ ...m, content: m.content.slice(0, 8000) })), { role: "user" as const, content }];
    // Keep the newest complete turns within the guest request budget.
    while (history.length > 1 && history.reduce((size, m) => size + m.content.length, 0) > 24000) history.shift();
    while (history[0]?.role === "assistant") history.shift();
    const controller = new AbortController();
    active.current = controller;
    setBusy(true); setError(""); setDraft("");
    const next: Message[] = [...messages, { role: "user", content }, { role: "assistant", content: "" }];
    setMessages(next);
    let answer = "";
    try {
      const response = await fetch("/api/guest/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: history }), signal: controller.signal,
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "The response failed. Please try again.");
      }
      if (!response.body) throw new Error("The response stream is unavailable.");
      let completed = false;
      for await (const frame of sseData(response.body)) {
        const event = JSON.parse(frame);
        if (event.type === "error") throw new Error(event.error);
        if (event.type === "done") completed = true;
        if (event.type === "text") {
          answer += event.text;
          setMessages([...next.slice(0, -1), { role: "assistant", content: answer }]);
        }
      }
      if (!completed || !answer.trim()) throw new Error("The response ended early. Please try again.");
    } catch (error) {
      setError(controller.signal.aborted ? "Response stopped." : error instanceof Error ? error.message : "The response failed. Please try again.");
      if (!answer) { setMessages(messages); setDraft(content); }
    } finally { active.current = null; setBusy(false); }
  }

  return (
    <main className="guest-shell">
      <header className="topbar guest-topbar">
        <Link className="brand" href="/chat"><span className="brand-mark">A</span> Aamor</Link>
        <nav className="guest-links" aria-label="Account"><Link href="/login">Sign in</Link><Link href="/register">Create account</Link></nav>
      </header>
      <div className="guest-controls">
        <label className="model-picker"><select aria-label="AI model" value={model} onChange={(event) => setModel(event.target.value)} disabled={busy || loading}>
          {!models.length && <option value="">{loading ? "Finding models…" : "No models available"}</option>}
          {models.map((m) => <option value={m.id} key={m.id}>{m.name} · {m.provider}</option>)}
        </select></label>
        <button className="text-button" onClick={refreshModels} disabled={loading || busy}>Refresh models</button>
        <button className="text-button" disabled={busy} onClick={() => { setMessages([]); setError(""); setDraft(""); }}>New chat</button>
      </div>
      <p className="guest-note">Guest chat · Messages disappear when you leave or refresh. <Link href="/register">Create an account</Link> for saved chats and attachments. Guest usage is limited.</p>
      <div className="chat-feed">
        {!messages.length ? <section className="guest-welcome"><p className="eyebrow">A LITTLE SPACE FOR BIG IDEAS</p><h1>What’s on your mind?</h1><p>Ask a question and try Aamor. No sign-in needed.</p></section> :
          <div className="messages">{messages.map((message, index) => <article key={index} className={`message ${message.role}`}><div className="message-avatar">{message.role === "user" ? "Y" : "A"}</div><div className="message-body"><div className="message-label">{message.role === "user" ? "You" : "Aamor"}</div>{message.content ? <Markdown content={message.content} onNotice={setNotice} /> : <p role="status">Thinking…</p>}</div></article>)}<div ref={latest} /></div>}
      </div>
      <div className="feedback-area">{error && <p className="error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}</div>
      <Composer value={draft} onChange={setDraft} onSend={send} onStop={() => active.current?.abort()} busy={busy} disabled={loading || !model} />
    </main>
  );
}
