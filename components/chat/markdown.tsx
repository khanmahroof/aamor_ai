"use client";
import { useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Copy } from "lucide-react";
function CodeBlock({
  children,
  onNotice,
}: {
  children: React.ReactNode;
  onNotice: (text: string) => void;
}) {
  const ref = useRef<HTMLPreElement>(null);
  return (
    <div className="code-block">
      <div className="code-toolbar">
        <span>Code</span>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(
                ref.current?.textContent ?? "",
              );
              onNotice("Code copied.");
            } catch {
              onNotice(
                "Clipboard unavailable. Select and copy the code manually.",
              );
            }
          }}
        >
          <Copy size={12} /> Copy code
        </button>
      </div>
      <pre ref={ref}>{children}</pre>
    </div>
  );
}
export function Markdown({
  content,
  onNotice,
}: {
  content: string;
  onNotice: (text: string) => void;
}) {
  return (
    <div className="markdown">
      <ReactMarkdown
        skipHtml
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          [rehypeHighlight, { detect: false, ignoreMissing: true }],
        ]}
        components={{
          pre: ({ children }) => (
            <CodeBlock onNotice={onNotice}>{children}</CodeBlock>
          ),
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          // Avoid loading arbitrary model-generated tracking pixels or remote resources.
          img: ({ alt }) => <span>[Image: {alt || "not loaded"}]</span>,
          table: ({ children }) => (
            <div className="table-scroll">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
