// Teams notifications.
//
// Notifications only — nobody replies from Teams and nothing here reads from
// it. The office inbox and the portal stay the record; this is the nudge that
// says go and look, posted into a channel the team already has open.
//
// Off until somebody switches it on, and switched on from the Settings page
// rather than an env var, so trying it out doesn't need a redeploy and turning
// it off in a hurry doesn't either.
//
// The transport is a Teams **Workflows** webhook (Power Automate). Microsoft
// retired the old Office 365 connectors, so that's what anyone setting this up
// today will get — but a legacy connector URL still works, because a payload
// one format rejects is retried in the other.
//
// The destination allowlist and the two card formats live in core.mjs, where
// they can be tested without a database.

import * as repo from "./repo";
import {
  TEAMS_EVENTS, TEAMS_DEFAULT_EVENTS, checkWebhook, teamsPrefersLegacy,
  teamsAdaptiveCard, teamsMessageCard,
} from "./core.mjs";

export { TEAMS_EVENTS, checkWebhook };

export type TeamsEvent = "lodged" | "message" | "enquiry" | "stuck" | "downloaded";

export interface TeamsConfig {
  enabled: boolean;
  webhook: string;
  events: Record<TeamsEvent, boolean>;
}

const DEFAULT_EVENTS = TEAMS_DEFAULT_EVENTS as Record<TeamsEvent, boolean>;

export const EMPTY_TEAMS: TeamsConfig = {
  enabled: false, webhook: "", events: { ...DEFAULT_EVENTS },
};

const SETTING = "teams";
const LAST = "teams_last";

function normalise(raw: unknown): TeamsConfig {
  const r = (raw || {}) as Partial<TeamsConfig>;
  const events = { ...DEFAULT_EVENTS };
  for (const e of TEAMS_EVENTS) {
    const key = e.key as TeamsEvent;
    const v = (r.events || {})[key];
    if (typeof v === "boolean") events[key] = v;
  }
  return {
    enabled: r.enabled === true,
    webhook: typeof r.webhook === "string" ? r.webhook.trim() : "",
    events,
  };
}

export async function getTeamsConfig(): Promise<TeamsConfig> {
  try {
    return normalise(await repo.getSetting<TeamsConfig>(SETTING));
  } catch {
    return { ...EMPTY_TEAMS, events: { ...DEFAULT_EVENTS } };
  }
}

export async function setTeamsConfig(next: TeamsConfig): Promise<void> {
  await repo.setSetting(SETTING, normalise(next));
}

export interface TeamsLast { at: string; ok: boolean; event: string; error?: string }

export async function getTeamsLast(): Promise<TeamsLast | null> {
  return repo.getSetting<TeamsLast>(LAST).catch(() => null);
}

/** What a notification looks like, before it's a card in anybody's format. */
export interface TeamsNote {
  title: string;
  /** Label/value rows. Empty values are dropped rather than printed blank. */
  facts?: [string, string][];
  /** The human bit — a message excerpt, a description. */
  text?: string;
  /** Where to go and deal with it. */
  link?: { label: string; url: string };
}

const TIMEOUT_MS = 6000;

async function post(url: string, payload: unknown): Promise<{ ok: boolean; status: number; body: string }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctl.signal,
    });
    const body = await res.text().catch(() => "");
    return { ok: res.ok, status: res.status, body: body.slice(0, 300) };
  } finally {
    clearTimeout(timer);
  }
}

async function note(event: string, ok: boolean, error?: string) {
  await repo.setSetting(LAST, { at: new Date().toISOString(), ok, event, error })
    .catch(() => {});
}

/**
 * Post one notification.
 *
 * Returns whether it went, and never throws — a Teams outage must not cost a
 * client their lodgement or the office an enquiry. Callers await it because a
 * serverless function can be frozen the moment it responds, so a fire-and-
 * forget send would silently never happen at all.
 */
export async function sendTeams(
  event: TeamsEvent | "test", body: TeamsNote, cfg?: TeamsConfig
): Promise<{ sent: boolean; why?: string }> {
  try {
    const c = cfg || (await getTeamsConfig());
    if (!c.enabled) return { sent: false, why: "Teams notifications are off." };
    if (event !== "test" && !c.events[event]) {
      return { sent: false, why: `${event} notifications are off.` };
    }
    const ck = checkWebhook(c.webhook);
    if (!ck.ok) return { sent: false, why: ck.why };

    // Which format first is a guess from the URL. A wrong guess costs one
    // extra request; being wrong with no fallback would cost every
    // notification, silently, which is the failure that matters here.
    const attempts = teamsPrefersLegacy(c.webhook)
      ? [teamsMessageCard(body), teamsAdaptiveCard(body)]
      : [teamsAdaptiveCard(body), teamsMessageCard(body)];

    let last = "";
    for (const payload of attempts) {
      const r = await post(c.webhook, payload);
      if (r.ok) { await note(event, true); return { sent: true }; }
      last = `HTTP ${r.status}${r.body ? ` — ${r.body}` : ""}`;
      // A 5xx is Teams having a bad time, not the wrong format. Retrying the
      // same content in another shape would risk posting it twice.
      if (r.status >= 500) break;
    }
    await note(event, false, last);
    console.warn(`teams: ${event} notification failed — ${last}`);
    return { sent: false, why: last };
  } catch (e) {
    const why = (e as Error).name === "AbortError"
      ? `Teams didn't answer within ${TIMEOUT_MS / 1000} seconds.`
      : (e as Error).message;
    await note(event, false, why);
    console.warn(`teams: ${event} notification failed —`, why);
    return { sent: false, why };
  }
}

/** Skips everything — including reading the config — when it's switched off,
 *  so a feature nobody turned on costs nothing on the client's request. */
export async function notifyTeams(event: TeamsEvent, body: TeamsNote): Promise<void> {
  const cfg = await getTeamsConfig();
  if (!cfg.enabled || !cfg.events[event]) return;
  await sendTeams(event, body, cfg);
}
