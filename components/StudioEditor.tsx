"use client";
import { useMemo, useRef } from "react";
import { SitePlanBuilder, type DesignStore } from "@/components/SitePlanBuilder";

/**
 * The studio's wrapper around the site-plan builder: same tool, different
 * home for the drawing. load() pulls this design's JSON once; save() is
 * already debounced by the builder, so each call goes straight up. A save
 * that fails keeps the last good copy on the server — worst case the client
 * redraws a minute's work, never the whole plan.
 */
export function StudioEditor(
  { id, owner, cadastre }: { id: string; owner: string; cadastre: boolean },
) {
  // One request in flight, and always the LATEST drawing next: a save that
  // arrives mid-flight replaces whatever was queued rather than being
  // dropped, so the server always converges on what's on screen.
  const pending = useRef<{ design: unknown; address: string } | null>(null);
  const inflight = useRef(false);
  const store = useMemo<DesignStore>(() => ({
    async load() {
      const r = await fetch(`/api/studio/designs/${id}`);
      if (!r.ok) return null;
      const d = await r.json().catch(() => null);
      return d?.design ?? null;
    },
    save(design, address) {
      pending.current = { design, address };
      if (inflight.current) return;
      inflight.current = true;
      void (async () => {
        while (pending.current) {
          const next = pending.current;
          pending.current = null;
          await fetch(`/api/studio/designs/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(next),
          }).catch(() => {});
        }
        inflight.current = false;
      })();
    },
  }), [id]);

  return <SitePlanBuilder companyId={owner} cadastre={cadastre} store={store} />;
}
