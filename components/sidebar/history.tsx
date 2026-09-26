"use client";
import { MessageSquare, Pencil, Search, Trash2 } from "lucide-react";
import type { ConversationView } from "@/lib/ui-types";
export function History({
  items,
  query,
  onQuery,
  onSelect,
  onRename,
  onDelete,
  current,
  disabled,
  more,
  onMore,
}: {
  items: ConversationView[];
  query: string;
  onQuery: (q: string) => void;
  onSelect: (item: ConversationView) => void;
  onRename: (item: ConversationView) => void;
  onDelete: (item: ConversationView) => void;
  current?: string;
  disabled: boolean;
  more: boolean;
  onMore: () => void;
}) {
  return (
    <>
      <label className="history-search">
        <Search size={14} />
        <input
          aria-label="Search conversations"
          placeholder="Search conversations"
          value={query}
          maxLength={200}
          onChange={(e) => onQuery(e.target.value)}
        />
        <kbd>/</kbd>
      </label>
      <div className="history-items">
        <p className="section-label">YOUR CONVERSATIONS</p>
        {items.map((item) => (
          <div
            key={item.id}
            className={`history-item ${item.id === current ? "selected" : ""}`}
          >
            <button
              className="history-select"
              onClick={() => onSelect(item)}
              disabled={disabled}
            >
              <MessageSquare size={13} />
              <span>{item.title}</span>
            </button>
            <div className="history-actions">
              <button
                aria-label={`Rename ${item.title}`}
                onClick={() => onRename(item)}
                disabled={disabled}
              >
                <Pencil size={12} />
              </button>
              <button
                aria-label={`Delete ${item.title}`}
                onClick={() => onDelete(item)}
                disabled={disabled}
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
        {!items.length && (
          <p className="small muted">
            {query
              ? "No conversations found."
              : "Your conversations will appear here."}
          </p>
        )}
        {more && (
          <button className="text-button" onClick={onMore}>
            Load more
          </button>
        )}
      </div>
    </>
  );
}
