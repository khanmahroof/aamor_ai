"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import type { SettingsInput } from "@/lib/validation/settings";
import type { Model } from "@/lib/ai/types";
import type { AttachmentView } from "@/lib/ui-types";
import { AttachmentList } from "./chat/attachments";
export function SettingsForm({ initial }: { initial: SettingsInput }) {
  const [settings, setSettings] = useState(initial);
  const [models, setModels] = useState<Model[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [unusedFiles, setUnusedFiles] = useState<AttachmentView[]>([]);
  useEffect(() => {
    api<AttachmentView[]>("/api/uploads")
      .then(setUnusedFiles)
      .catch(() => {});
  }, []);
  useEffect(() => {
    api<{ models: Model[] }>("/api/models")
      .then((data) => setModels(data.models))
      .catch(() =>
        setMessage(
          "Could not refresh models. Your saved preferences are still available.",
        ),
      );
  }, []);
  return (
    <form
      className="settings-form"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setMessage("");
        try {
          await api("/api/settings", {
            method: "PATCH",
            body: JSON.stringify(settings),
          });
          document.documentElement.dataset.theme =
            settings.theme === "system"
              ? window.matchMedia("(prefers-color-scheme: dark)").matches
                ? "dark"
                : "light"
              : settings.theme;
          setMessage("Preferences saved.");
        } catch (error) {
          setMessage(
            error instanceof Error
              ? error.message
              : "Could not save preferences.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <section>
        <h2>Make Aamor yours</h2>
        <p className="muted">
          Instructions and defaults for your conversations.
        </p>
        <label>
          Custom instructions
          <textarea
            rows={6}
            maxLength={8000}
            value={settings.systemPrompt}
            onChange={(e) =>
              setSettings({ ...settings, systemPrompt: e.target.value })
            }
            placeholder="What should Aamor know about how you like to work?"
          />
          <span className="small muted">
            Keep this concise for smaller local models.{" "}
            {settings.systemPrompt.length}/8,000 characters
          </span>
        </label>
      </section>
      <section>
        <h2>Model preferences</h2>
        <div className="settings-grid">
          <label>
            Default provider
            <select
              value={settings.preferredProvider}
              onChange={(e) => {
                const provider = e.target
                  .value as SettingsInput["preferredProvider"];
                setSettings({
                  ...settings,
                  preferredProvider: provider,
                  preferredModel:
                    models.find((m) => m.provider === provider)?.id ?? null,
                });
              }}
            >
              <option value="ollama">Ollama · local</option>
              {models.some((m) => m.provider === "groq") && (
                <option value="groq">Groq · cloud</option>
              )}
              {models.some((m) => m.provider === "openai") && (
                <option value="openai">OpenAI · cloud</option>
              )}
              {models.some((m) => m.provider === "anthropic") && (
                <option value="anthropic">Anthropic · cloud</option>
              )}
              {!models.some((m) => m.provider === settings.preferredProvider) &&
                settings.preferredProvider !== "ollama" && (
                  <option value={settings.preferredProvider}>
                    {settings.preferredProvider} · unavailable
                  </option>
                )}
            </select>
          </label>
          <label>
            Default model
            <select
              value={settings.preferredModel ?? ""}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  preferredModel: e.target.value || null,
                })
              }
            >
              <option value="">Choose when starting a chat</option>
              {models
                .filter((m) => m.provider === settings.preferredProvider)
                .map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <label>
          Temperature · {settings.temperature.toFixed(1)}
          <input
            type="range"
            min={0}
            max={1}
            step={0.1}
            value={settings.temperature}
            onChange={(e) =>
              setSettings({ ...settings, temperature: Number(e.target.value) })
            }
          />
          <span className="small muted">
            Lower values are more focused; higher values are more varied. Some
            cloud models use a fixed temperature.
          </span>
        </label>
      </section>
      <section>
        <h2>Appearance</h2>
        <label>
          Theme
          <select
            value={settings.theme}
            onChange={(e) =>
              setSettings({
                ...settings,
                theme: e.target.value as SettingsInput["theme"],
              })
            }
          >
            <option value="system">Follow system</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </section>
      {!!unusedFiles.length && (
        <section>
          <h2>Unused uploads</h2>
          <p className="small muted">
            These files have not been sent in a message. Unused uploads expire
            after 24 hours.
          </p>
          <AttachmentList
            files={unusedFiles}
            onRemove={async (id) => {
              try {
                await api(`/api/files/${id}`, { method: "DELETE" });
                setUnusedFiles((previous) =>
                  previous.filter((file) => file.id !== id),
                );
              } catch {
                setMessage("Could not remove this upload.");
              }
            }}
          />
        </section>
      )}
      <p className="small muted">
        Cloud models send your selected messages and attachment context to that
        provider. Ollama runs locally when its server is on this computer.
      </p>
      <button className="primary" disabled={busy}>
        {busy ? "Saving…" : "Save preferences"}
      </button>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
    </form>
  );
}
