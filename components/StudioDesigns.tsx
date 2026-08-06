"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DesignMeta } from "@/lib/studio";

const fmt = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-AU", {
    day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Perth",
  });
};

/** The studio home: every saved plan as a card, and the New Plan door. */
export function StudioDesigns(
  { designs, name, viaPortal }:
  { designs: DesignMeta[]; name: string; viaPortal: boolean },
) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function api(path: string, init?: RequestInit): Promise<Record<string, unknown> | null> {
    try {
      const r = await fetch(path, init);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(String(d.error || "That didn't work — try again.")); return null; }
      return d;
    } catch {
      setMsg("We couldn't reach the server — try again.");
      return null;
    }
  }

  async function newPlan() {
    setBusy("new"); setMsg(null);
    const d = await api("/api/studio/designs", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Untitled plan" }),
    });
    setBusy(null);
    if (d?.id) router.push(`/studio/designs/${d.id}`);
  }

  async function duplicate(id: string) {
    setBusy(id); setMsg(null);
    const d = await api("/api/studio/designs", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ duplicateOf: id }),
    });
    setBusy(null);
    if (d?.id) router.push(`/studio/designs/${d.id}`);
  }

  async function rename(id: string, current: string) {
    const name = prompt("Name this plan:", current);
    if (name === null || !name.trim()) return;
    setBusy(id);
    await api(`/api/studio/designs/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setBusy(null);
    router.refresh();
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This can't be undone.`)) return;
    setBusy(id);
    await api(`/api/studio/designs/${id}`, { method: "DELETE" });
    setBusy(null);
    router.refresh();
  }

  async function signOut() {
    // Portal clients sign out of the portal session; studio accounts out of
    // theirs. Either way the front door is the destination.
    await fetch(viaPortal ? "/api/auth/logout" : "/api/studio/logout", { method: "POST" })
      .catch(() => {});
    window.location.assign("/studio");
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[24px] font-semibold text-ink">Your plans</h1>
          <p className="mt-1 text-[13.5px] text-ink/55">
            Signed in as <span className="font-medium text-ink/75">{name}</span>
            {viaPortal ? " (CFBA portal account)" : ""} ·{" "}
            <button onClick={signOut} className="underline hover:text-seal">sign out</button>
          </p>
        </div>
        <button onClick={newPlan} disabled={busy === "new"} className="btn">
          + New Plan
        </button>
      </div>

      {msg && (
        <p role="alert" className="mb-4 rounded-md bg-[#FBEBEC] px-3 py-2 text-[13px] text-[#8C2630]">
          {msg}
        </p>
      )}

      {designs.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="font-display text-[18px] font-semibold text-ink">Nothing here yet</p>
          <p className="mx-auto mt-2 max-w-sm text-[14px] text-ink/60">
            Start your first site plan — trace the lot over the aerial photo or
            type the boundary in, drop the structures on, and print a
            true-scale A4 sheet.
          </p>
          <button onClick={newPlan} disabled={busy === "new"} className="btn mt-5">
            Start your first plan
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {designs.map((d) => (
            <div key={d.id} className="card flex flex-col p-5">
              <a href={`/studio/designs/${d.id}`} className="group min-w-0">
                <div className="truncate font-display text-[16.5px] font-semibold text-ink group-hover:text-seal">
                  {d.name}
                </div>
                <div className="mt-1 truncate text-[13px] text-ink/55">
                  {d.address || "No address yet"}
                </div>
                <div className="mt-0.5 text-[12px] text-ink/40">
                  Updated {fmt(d.updatedAt)}
                </div>
              </a>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-rule pt-3">
                <a href={`/studio/designs/${d.id}`} className="btn-ghost text-[12.5px]">Open</a>
                <button onClick={() => duplicate(d.id)} disabled={busy === d.id}
                  className="btn-ghost text-[12.5px]">Duplicate</button>
                <button onClick={() => rename(d.id, d.name)} disabled={busy === d.id}
                  className="btn-ghost text-[12.5px]">Rename</button>
                <button onClick={() => remove(d.id, d.name)} disabled={busy === d.id}
                  className="btn-ghost text-[12.5px] text-[#8C2630]">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
