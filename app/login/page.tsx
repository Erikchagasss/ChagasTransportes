"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError("E-mail ou senha incorretos.");
      setLoading(false);
      return;
    }

    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-graphite-950 px-6">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-2xl font-semibold text-white">Fretado</h1>
        <p className="mb-8 text-sm text-graphite-600">Entre com sua conta.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-mist-200" htmlFor="email">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-card border border-graphite-700 bg-graphite-900 px-4 py-3 text-white outline-none focus-visible:border-amber-500"
              autoComplete="email"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-mist-200" htmlFor="password">
              Senha
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-card border border-graphite-700 bg-graphite-900 px-4 py-3 text-white outline-none focus-visible:border-amber-500"
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-danger-500">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-card bg-amber-500 py-3 font-medium text-graphite-950 transition hover:bg-amber-600 disabled:opacity-60"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </main>
  );
}
