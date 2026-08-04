"use client";
import { useState } from "react";

/**
 * Send this job's record to the office now, rather than waiting for a client
 * to download their package. Runs the real path — same builder, same
 * attachment, same size fallback — so what arrives is what will arrive.
 */
export function RecordTestSend({ refNo }: { refNo: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function send() {
    setState("busy"); setMsg("");
    try {
      const r = await fetch(`/api/admin/records/${encodeURIComponent(refNo)}/test`,
        { method: "POST" });
      const d = await r.json().catch(() => ({}));
      setMsg(d.message || d.error || (r.ok ? "Sent." : "That didn't send."));
      setState(r.ok ? "done" : "error");
    } catch (e) {
      setMsg((e as Error).message);
      setState("error");
    }
  }

  return (
    <>
      <button onClick={send} disabled={state === "busy"}
        className="btn-ghost whitespace-nowrap">
        {state === "busy" ? "Sending…" : state === "done" ? "Sent ✓" : "Email me a copy"}
      </button>
      {msg && (
        <div className={`mt-1 max-w-[220px] text-[11.5px] leading-snug ${
          state === "error" ? "text-flag" : "text-ink/55"}`}>
          {msg}
        </div>
      )}
    </>
  );
}
