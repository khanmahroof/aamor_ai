"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
export function AuthForm({
  register = false,
  google = false,
}: {
  register?: boolean;
  google?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    try {
      if (register) {
        const response = await fetch("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name: form.get("name") }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
      }
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl: "/chat",
      });
      if (result?.error || !result?.ok)
        throw new Error(
          "Sign-in failed. Check your credentials, or wait a few minutes and retry.",
        );
      router.push("/chat");
      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to connect. Please retry.",
      );
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link href="/" className="brand">
          <span className="brand-mark">A</span> Aamor
        </Link>
        <p className="eyebrow">YOUR SPACE TO THINK</p>
        <h1>{register ? "Make room for your ideas." : "Welcome back."}</h1>
        <p className="muted">
          {register
            ? "Create an account with your email to save your conversations."
            : "Sign in to pick up where you left off."}
        </p>
        <form onSubmit={submit}>
          {register && (
            <label>
              Your name
              <input name="name" autoComplete="name" required maxLength={80} />
            </label>
          )}
          <label>
            Email
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete={register ? "new-password" : "current-password"}
              required
              minLength={8}
              maxLength={128}
            />
          </label>
          {register && (
            <p className="small muted">
              At least 8 characters. A memorable phrase works well.
            </p>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? "Please wait…" : register ? "Create account" : "Sign in"}
          </button>
        </form>
        {google && (
          <button
            className="secondary"
            disabled={busy}
            onClick={() => signIn("google", { callbackUrl: "/chat" })}
          >
            Continue with Google
          </button>
        )}
        <p className="small">
          {register ? "Already have an account?" : "New to Aamor?"}{" "}
          <Link href={register ? "/login" : "/register"}>
            {register ? "Sign in" : "Create an account"}
          </Link>
        </p>
        <p className="small"><Link href="/chat">Continue as guest — no account needed</Link></p>
      </section>
      <p className="auth-note">
        An independent assistant. A little space for big ideas.
      </p>
    </main>
  );
}
