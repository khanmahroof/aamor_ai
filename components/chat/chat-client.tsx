"use client";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { ArrowDown, LogOut, Menu, Moon, Plus, Sun } from "lucide-react";
import { api } from "@/lib/client-api";
import { Composer } from "./composer";
import { Welcome } from "./welcome";
import { History } from "../sidebar/history";
import { MessageList } from "./message-list";
import { AttachButton, AttachmentList } from "./attachments";
import { useChatController } from "./use-chat-controller";
export function ChatClient({ name }: { name: string }) {
  const {
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
  } = useChatController();
  return (
    <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      {sidebar && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setSidebar(false)}
        />
      )}
      <aside className={`sidebar ${sidebar ? "is-open" : ""}`}>
        <a className="brand" href="/chat">
          <span className="brand-mark">A</span> Aamor
          <span className="brand-tag">LOCAL FIRST</span>
        </a>
        <button
          className="new-chat"
          onClick={newChat}
          disabled={busy || switching || stopping || uploading}
        >
          <Plus size={18} /> New conversation <kbd>Ctrl K</kbd>
        </button>
        <div className="sidebar-history">
          <History
            items={history}
            query={query}
            onQuery={setQuery}
            onSelect={selectConversation}
            onRename={renameConversation}
            onDelete={deleteConversation}
            current={conversation?.id}
            disabled={busy || switching || stopping || uploading}
            more={moreHistory}
            onMore={() => loadHistory(history.length)}
          />
        </div>
        <div className="sidebar-bottom">
          <nav className="sidebar-links">
            <Link href="/settings">Preferences</Link>
            <Link href="/usage">Usage</Link>
            <button onClick={refreshModels}>Refresh models</button>
          </nav>
          <div className="local-status">
            <span /> A little space for big ideas
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="profile"
          >
            <span className="avatar">{name.charAt(0).toUpperCase()}</span>
            <span>
              {name}
              <small>Personal workspace</small>
            </span>
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            onClick={() => setSidebar(!sidebar)}
            aria-label="Toggle navigation"
          >
            <Menu size={20} />
          </button>
          <button
            className="icon-button desktop-menu"
            onClick={() => setCollapsed(!collapsed)}
            aria-label="Collapse or expand sidebar"
          >
            <Menu size={17} />
          </button>
          <div className="chat-title">
            {conversation?.title === "New chat"
              ? "Conversation"
              : conversation?.title || "New conversation"}
          </div>
          <div className="topbar-actions">
            <label className="model-picker">
              <span
                className={`status-dot ${selected?.provider === "ollama" ? "local" : ""}`}
              />
              <select
                aria-label="AI model"
                value={model}
                onChange={(e) => {
                  setModel(e.target.value);
                  void api("/api/settings", {
                    method: "PATCH",
                    body: JSON.stringify({
                      preferredModel: e.target.value,
                      preferredProvider: e.target.value.split("/")[0],
                    }),
                  }).catch(() =>
                    setNotice("Model preference could not be saved."),
                  );
                }}
                disabled={busy || stopping || loading}
              >
                {(!models.length || (model && !selected)) && (
                  <option value={model}>
                    {loading
                      ? "Finding models…"
                      : model
                        ? "Model unavailable — choose another"
                        : "No models available"}
                  </option>
                )}
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} · {m.provider}
                    {m.vision ? " · vision" : ""}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="icon-button"
              onClick={toggleTheme}
              aria-label="Toggle theme"
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </header>
        <div
          className="chat-feed"
          ref={feed}
          onScroll={onFeedScroll}
        >
          {switching && (
            <div className="loading-line" role="status">
              Loading conversation…
            </div>
          )}
          {moreMessages && conversation && (
            <button
              className="text-button load-older"
              onClick={() => selectConversation(conversation, true)}
              disabled={switching || busy || stopping || uploading}
            >
              Load earlier messages
            </button>
          )}
          {!messages.length ? (
            <Welcome
              name={name}
              onDraft={setDraft}
              loading={loading}
              hasModels={models.length > 0}
              onRefresh={refreshModels}
            />
          ) : (
            <MessageList
              messages={messages}
              name={name}
              busy={busy || switching || stopping || uploading}
              onNotice={setNotice}
              onRetry={(id) => send({ action: "retry", messageId: id })}
              onEdit={(id, content) =>
                send({ action: "edit", messageId: id, content })
              }
            />
          )}{" "}
        </div>
        {!atBottom && (
          <button
            className="scroll-bottom"
            aria-label="Scroll to latest message"
            onClick={scrollToLatest}
          >
            <ArrowDown size={16} /> Latest
          </button>
        )}
        <div className="feedback-area">
          {error && (
            <div role="alert" className="error">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                ×
              </button>
            </div>
          )}
          {notice && (
            <div role="status" className="notice">
              {notice}
              <button aria-label="Dismiss notice" onClick={() => setNotice("")}>
                ×
              </button>
            </div>
          )}
          {usage && (
            <p className="usage-inline">
              {usage.estimated ? "Estimated" : "Reported"} · {usage.inputTokens}{" "}
              input / {usage.outputTokens} output / {usage.totalTokens} total
              tokens
            </p>
          )}
        </div>
        <div className="pending-files">
          <AttachmentList
            files={attachments}
            onRemove={busy || stopping ? undefined : removeAttachment}
          />
          {uploading && (
            <p role="status" className="small muted">
              Reading attachment…
            </p>
          )}
        </div>
        <Composer
          extra={
            <AttachButton
              onUpload={upload}
              disabled={
                busy || stopping || uploading || attachments.length >= 3
              }
            />
          }
          hasAttachments={attachments.length > 0}
          value={draft}
          onChange={setDraft}
          onSend={() => send()}
          onStop={stop}
          busy={busy}
          disabled={!selected || loading || switching || uploading || stopping}
        />
      </div>
    </div>
  );
}
