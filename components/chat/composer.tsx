"use client";
import { useRef, useEffect } from "react";
import { ArrowUp, Square } from "lucide-react";
export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  busy,
  disabled,
  extra,
  hasAttachments = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  busy: boolean;
  disabled: boolean;
  extra?: React.ReactNode;
  hasAttachments?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = Math.min(ref.current.scrollHeight, 200) + "px";
    }
  }, [value]);
  return (
    <div className="composer-area">
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy && !disabled) onSend();
        }}
      >
        <textarea
          ref={ref}
          aria-label="Message Aamor"
          placeholder="Ask anything, or start with an idea…"
          value={value}
          maxLength={32000}
          rows={1}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              if (!busy && !disabled) onSend();
            }
          }}
        />
        <div className="composer-toolbar">
          <div className="composer-tools">
            {extra}
            <span className="small muted">Shift + Enter for a new line</span>
          </div>
          {busy ? (
            <button
              type="button"
              className="send"
              aria-label="Stop generation"
              onClick={onStop}
            >
              <Square size={16} fill="currentColor" />
            </button>
          ) : (
            <button
              className="send"
              aria-label="Send message"
              disabled={disabled || (!value.trim() && !hasAttachments)}
            >
              <ArrowUp size={20} />
            </button>
          )}
        </div>
      </form>
      <p className="disclaimer">
        Aamor can make mistakes. Check important details.
      </p>
    </div>
  );
}
