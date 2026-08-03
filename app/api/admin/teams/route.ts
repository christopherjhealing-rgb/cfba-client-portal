import { NextResponse } from "next/server";
import { isStaff } from "@/lib/session";
import {
  getTeamsConfig, setTeamsConfig, sendTeams, checkWebhook,
  TEAMS_EVENTS, type TeamsEvent, type TeamsConfig,
} from "@/lib/teams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEYS = new Set(TEAMS_EVENTS.map((e) => e.key as string));

export async function POST(req: Request) {
  if (!(await isStaff())) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));

    // A test uses whatever is saved, so pressing it proves the thing that will
    // actually run at 2am rather than the thing that was in the form.
    if (body.test) {
      const cfg = await getTeamsConfig();
      if (!cfg.enabled) {
        return NextResponse.json(
          { error: "Switch Teams notifications on and save first — a test that bypassed the switch wouldn't prove anything." },
          { status: 400 }
        );
      }
      const r = await sendTeams("test", {
        title: "CFBA Portal — test notification",
        facts: [
          ["Sent from", "Settings → Teams Notifications"],
          ["Meaning", "The webhook works. Real notifications will arrive here."],
        ],
        text: "If you can read this, the channel is wired up correctly. Nothing else has happened — this was sent by hand.",
      }, cfg);
      return r.sent
        ? NextResponse.json({ ok: true, sent: true })
        : NextResponse.json({ error: r.why || "It didn't send." }, { status: 502 });
    }

    const current = await getTeamsConfig();
    const next: TeamsConfig = {
      enabled: typeof body.enabled === "boolean" ? body.enabled : current.enabled,
      webhook: typeof body.webhook === "string" ? body.webhook.trim() : current.webhook,
      events: { ...current.events },
    };
    if (body.events && typeof body.events === "object") {
      for (const [k, v] of Object.entries(body.events)) {
        if (KEYS.has(k) && typeof v === "boolean") next.events[k as TeamsEvent] = v;
      }
    }

    // Only a webhook that could actually work is allowed to be saved switched
    // on, so "on" on this page always means "on".
    if (next.enabled) {
      const ck = checkWebhook(next.webhook);
      if (!ck.ok) return NextResponse.json({ error: ck.why }, { status: 400 });
    }

    await setTeamsConfig(next);
    return NextResponse.json({ ok: true, config: next });
  } catch (e) {
    console.error("teams settings failed:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
