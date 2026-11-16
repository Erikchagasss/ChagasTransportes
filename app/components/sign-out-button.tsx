"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SignOutButton() {
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const locked = useRef(false);

  async function signOut() {
    if(locked.current) return;
    locked.current = true;
    setBusy(true);setError("");
    try {
      const {error} = await createClient().auth.signOut({scope:"local"});
      if(error) throw error;
      // Recarrega o documento para descartar o cache das telas autenticadas.
      window.location.replace("/login");
    } catch {
      setError("Não foi possível sair. Tente novamente.");
      locked.current = false;
      setBusy(false);
    }
  }

  return <div className="flex flex-col items-start gap-1">
    <button type="button" aria-label="Sair da conta" disabled={busy} onClick={()=>void signOut()} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-white/30 px-4 py-2 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50">
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 4H4v16h5M14 7l5 5-5 5M8 12h11" /></svg>
      {busy ? "Saindo..." : "Sair"}
    </button>
    {error && <p role="alert" className="max-w-56 text-xs text-red-200">{error}</p>}
  </div>;
}
