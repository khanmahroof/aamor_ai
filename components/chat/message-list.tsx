"use client";
import { Copy, Sparkles, Pencil, RotateCcw } from "lucide-react";
import { useState } from "react";
import type { MessageView } from "@/lib/ui-types";
import { Markdown } from "./markdown";
import { AttachmentList } from "./attachments";
export function MessageList({
  messages,
  name,
  busy,
  onNotice,
  onRetry,
  onEdit,
}: {
  messages: MessageView[];
  name: string;
  busy: boolean;
  onNotice: (text: string) => void;
  onRetry: (id: string) => void;
  onEdit: (id: string, text: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const latestUser = messages.findLast((m) => m.role === "user");
  return (
    <div className="messages">
      {messages.map((message, index) => (
        <article key={message.id} className={`message ${message.role}`}>
          <div className="message-avatar">
            {message.role === "user" ? (
              name.charAt(0).toUpperCase()
            ) : (
              <Sparkles size={18} />
            )}
          </div>
          <div className="message-body">
            <div className="message-label">
              {message.role === "user" ? "You" : "Aamor"}
              {message.role === "assistant" && (
                <span>{message.model?.split("/").slice(1).join("/")}</span>
              )}
            </div>
            {editing === message.id ? (
              <div className="edit-message">
                <textarea
                  aria-label="Edit message"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  maxLength={32000}
                />
                <p className="small muted">
                  Sending an edit removes all later messages in this
                  conversation.
                </p>
                <button
                  className="primary"
                  disabled={!value.trim() || busy}
                  onClick={() => {
                    onEdit(message.id, value);
                    setEditing(null);
                  }}
                >
                  Save & retry
                </button>
                <button
                  className="text-button"
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </button>
              </div>
            ) : message.role === "user" ? (
              <div className="plain-message">{message.content}</div>
            ) : message.content ? (
              <Markdown content={message.content} onNotice={onNotice} />
            ) : busy && index === messages.length - 1 ? (
              <span className="thinking" role="status">
                Thinking<span>•••</span>
              </span>
            ) : (
              <p className="muted small">No response was generated.</p>
            )}
            {message.status &&
              message.status !== "completed" &&
              !(busy && index === messages.length - 1) && (
                <p className="small muted">
                  {message.status === "interrupted"
                    ? "Response stopped"
                    : "Response could not be completed"}
                </p>
              )}
            {!!message.attachments?.length && (
              <AttachmentList files={message.attachments} />
            )}
            {message.content && (
              <div className="message-actions">
                <button
                  aria-label="Copy message"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(message.content);
                      onNotice("Message copied.");
                    } catch {
                      onNotice(
                        "Clipboard unavailable. Select the text to copy it.",
                      );
                    }
                  }}
                >
                  <Copy size={13} /> Copy
                </button>
              </div>
            )}
            <div className="message-actions">
              {message.role === "user" && (
                <button
                  disabled={busy}
                  onClick={() => {
                    setEditing(message.id);
                    setValue(message.content);
                  }}
                >
                  <Pencil size={12} /> Edit
                </button>
              )}
              {latestUser && index === messages.length - 1 && (
                <button disabled={busy} onClick={() => onRetry(latestUser.id)}>
                  <RotateCcw size={12} />{" "}
                  {message.status === "failed" ||
                  message.status === "interrupted"
                    ? "Retry"
                    : "Regenerate"}
                </button>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
