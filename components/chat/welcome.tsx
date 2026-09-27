"use client";
import { ArrowUpRight, BookOpen, Code2, Compass, Sparkles } from "lucide-react";
export function Welcome({
  name,
  onDraft,
  loading,
  hasModels,
  defaultProvider,
  onRefresh,
}: {
  name: string;
  onDraft: (text: string) => void;
  loading: boolean;
  hasModels: boolean;
  defaultProvider: string;
  onRefresh: () => void;
}) {
  return (
    <section className="welcome">
      <div className="welcome-mark">
        <Sparkles size={30} strokeWidth={1.4} />
      </div>
      <p className="eyebrow">A FRESH PERSPECTIVE</p>
      <h1>What’s on your mind, {name.split(" ")[0]}?</h1>
      <p className="welcome-subtitle">
        A question, a rough idea, a new direction.
        <br />
        Let’s work through it together.
      </p>
      <div className="suggestions">
        {[
          {
            icon: BookOpen,
            title: "Make it make sense",
            text: "Explain a tricky concept simply",
            prompt:
              "Explain how neural networks learn, using a simple everyday analogy.",
          },
          {
            icon: Code2,
            title: "Build something",
            text: "Find a starting point for your code",
            prompt:
              "Help me plan a small beginner-friendly coding project I can build this weekend.",
          },
          {
            icon: Compass,
            title: "Explore an idea",
            text: "Turn a what-if into a plan",
            prompt:
              "Help me brainstorm an original idea for a student project with a zero budget.",
          },
        ].map((item) => (
          <button
            key={item.title}
            onClick={() => onDraft(item.prompt)}
            className="suggestion"
          >
            <item.icon size={20} />
            <strong>{item.title}</strong>
            <span>{item.text}</span>
            <ArrowUpRight className="suggestion-arrow" size={16} />
          </button>
        ))}
      </div>
      {!loading && !hasModels && (
        <div className="setup-callout">
          {defaultProvider === "ollama" ? (
            <>
              <strong>Connect a local model</strong>
              <p>
                Start Ollama and download a model to begin. No paid API key is
                required.
              </p>
              <a
                className="text-button"
                href="https://ollama.com/download"
                target="_blank"
                rel="noopener noreferrer"
              >
                Install Ollama
              </a>
              <code>ollama pull llama3.2:3b</code>
            </>
          ) : (
            <>
              <strong>No cloud models available</strong>
              <p>
                The server could not load its configured{" "}
                {defaultProvider === "groq" ? "Groq" : defaultProvider} models.
                Ask the app owner to check the provider configuration, then
                refresh.
              </p>
            </>
          )}
          <button className="text-button" onClick={onRefresh}>
            Refresh models
          </button>
        </div>
      )}
    </section>
  );
}
