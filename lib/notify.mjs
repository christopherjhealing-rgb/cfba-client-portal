// ---------------------------------------------------------------------------
// What's new since this browser last looked.
//
// The portal polls a small endpoint while a client has it open, and this is
// the arithmetic that decides whether any of it is worth interrupting them
// for. Pure functions over two plain records — the snapshot that came back,
// and what we've already told this browser about — so the whole thing is
// testable without a browser or a network.
//
// The rule that matters: never re-announce. A client who refreshes the page,
// or comes back after lunch, must not be told a second time about a message
// or a certificate they've already been told about. Anything we've raised
// once is written down, and the record is what the next poll is measured
// against.
// ---------------------------------------------------------------------------

/** Ready jobs remembered per company. Well past the number anyone has
 *  waiting at once; the cap only stops a runaway record growing forever. */
export const READY_MEMORY = 50;

/** Ready jobs announced in one go. If a sync issues five at once, three
 *  cards is plenty of interruption — the rest are on Downloads, and all
 *  five are recorded so none of them comes back later as "news". */
export const READY_TOASTS = 3;

/** Where one company's record lives in localStorage. Keyed per company so
 *  two clients sharing a computer never inherit each other's news. */
export function seenKey(company) {
  const slug = String(company || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `cfba-seen:${slug || "client"}`;
}

/** Read a stored record back, defended against whatever else might be under
 *  the key — an older shape, a half-written string, somebody's experiment.
 *  Anything unrecognisable is treated as "no record", which is safe: the
 *  next poll simply starts the record again without announcing anything. */
export function sanitiseSeen(raw) {
  if (!raw || typeof raw !== "object") return null;
  const unread = Number(raw.unread);
  if (!Number.isFinite(unread) || unread < 0) return null;
  const ready = Array.isArray(raw.ready)
    ? raw.ready.map((r) => String(r || "")).filter(Boolean).slice(0, READY_MEMORY)
    : [];
  return { unread: Math.floor(unread), ready };
}

/** The same treatment for the payload off the wire. null means "no usable
 *  answer" — which the poller treats as a failure to back off from, never as
 *  "nothing is happening". */
export function sanitiseSnapshot(raw) {
  if (!raw || typeof raw !== "object") return null;
  const unread = Number(raw.unread);
  if (!Number.isFinite(unread) || unread < 0) return null;
  const ready = Array.isArray(raw.ready)
    ? raw.ready
        .filter((j) => j && typeof j === "object" && j.ref)
        .map((j) => ({ ref: String(j.ref), address: String(j.address || "") }))
        .slice(0, READY_MEMORY)
    : [];
  return { unread: Math.floor(unread), ready };
}

/**
 * Compare a snapshot with the record, and return both what's worth saying
 * and the record to keep.
 *
 * `seen` of null is this browser's first look at this company's portal:
 * write everything down and say nothing at all. The page they're on already
 * shows the lot, and greeting somebody with four cards about jobs they
 * issued last week is exactly the noise this is meant to avoid.
 *
 * Ready refs are pruned to whatever is ready now. A job leaves that list
 * only by being downloaded, and a downloaded job never becomes ready again,
 * so nothing that's forgotten can come back as false news.
 */
export function newsSince(seen, snap) {
  const next = { unread: snap.unread, ready: snap.ready.map((j) => j.ref) };
  if (!seen) return { events: [], seen: next };

  const events = [];
  const known = new Set(seen.ready);
  for (const j of snap.ready) {
    if (known.has(j.ref)) continue;
    if (events.length < READY_TOASTS) {
      events.push({ kind: "ready", ref: j.ref, address: j.address });
    }
  }
  // Only a rise counts. Reading a thread drops the count, and stepping the
  // record down quietly is the whole point — the next new message is news
  // again, the ones they've just read are not.
  if (snap.unread > seen.unread) {
    events.push({ kind: "message", unread: snap.unread });
  }
  return { events, seen: next };
}
