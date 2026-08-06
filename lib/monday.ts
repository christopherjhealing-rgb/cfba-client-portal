// Monday client. Reads the board for status and writes a new card when a
// portal submission is accepted. Column ids match the live CFBA / EWA board.
import { env, MONDAY_READY, DEMO_MODE } from "./env";
import {
  portalColumnWrite, portalLadder, INFO_RECEIVED_STATUS, AWAITING_REPLY_STATUSES,
  refSearchTerms, sameRef,
} from "./core.mjs";

const API = "https://api.monday.com/v2";

// Writes that change a card the office is working from. Demo mode must never
// reach the real board even if a token happens to be in the environment —
// that's the rule the whole dry-run workflow rests on.
const CAN_WRITE = MONDAY_READY && !DEMO_MODE;

const COL = {
  status: "status",
  class: "status_1__1",
  client: "client__1",
  email: "email_mkspqm6m",
  ref: "text__1",
  description: "text0__1",
  files: "file_mksmhvsk", // "Files" column — lodged documents land here
  people: "multiple_person_mkstvc5z",
  // "Certified By" — who signed the certificate. This, not People, is what
  // says whose job an amendment belongs to: People sits empty on most issued
  // cards, while Certified By is filled in by definition once a CDC exists.
  certifiedBy: env.certifiedByColumnId,
  // "PORTAL" — where a job is up to in the client portal. The portal writes
  // every rung of it; see lib/core.mjs. Not the main Status column, which
  // tracks the assessment, and no longer the old "Send?" / "Job Sent" pair.
  portal: env.portalColumnId,
};

async function gql<T = Record<string, unknown>>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const r = await fetch(API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: env.mondayToken,
      "API-Version": "2024-10",
    },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error("Monday: " + JSON.stringify(j.errors));
  return j.data as T;
}

export interface MondayCard {
  itemId: string;
  ref: string;
  clientName: string;
  email: string;
  address: string;
  description: string;
  status: string;
  createdAt: string | null;
  /** Names in the People column, e.g. "Kacie X, Rebecca Y". */
  peopleText: string;
}

function readCard(it: Record<string, unknown>): MondayCard {
  const cols: Record<string, string> = {};
  for (const cv of (it.column_values as Record<string, unknown>[]) || []) {
    cols[cv.id as string] = ((cv.text as string) || "").trim();
  }
  return {
    itemId: String(it.id),
    ref: cols[COL.ref] || String(it.id),
    clientName: cols[COL.client] || "",
    email: cols[COL.email] || "",
    address: (it.name as string) || "",
    description: cols[COL.description] || "",
    status: cols[COL.status] || "",
    createdAt: (it.created_at as string) || null,
    peopleText: cols[COL.people] || "",
  };
}

const CARD_FIELDS = `id name created_at column_values(ids:["${COL.status}","${COL.client}","${COL.email}","${COL.ref}","${COL.description}","${COL.people}"]){ id text }`;

/** Cards currently sitting at the given status label(s). */
export async function listByStatus(labels: string | string[]): Promise<MondayCard[]> {
  if (!MONDAY_READY) return [];
  const q = `
    query ($board: ID!, $col: String!, $vals: [String]!) {
      items_page_by_column_values(limit: 500, board_id: $board,
        columns: [{ column_id: $col, column_values: $vals }]) {
        items { ${CARD_FIELDS} }
      }
    }`;
  const d = await gql<{ items_page_by_column_values: { items: Record<string, unknown>[] } }>(
    q, { board: env.mondayBoardId, col: COL.status,
         vals: Array.isArray(labels) ? labels : [labels] });
  return (d.items_page_by_column_values?.items || []).map(readCard);
}

/**
 * Find a card by its reference — including one the portal has never seen.
 *
 * The sync only ever pulls issued and non-closed cards, so a job invoiced
 * before the portal existed simply isn't here: on a board of 3,827 items that
 * is most of them. A council asking for a change to a job from six months ago
 * is the ordinary case for an amendment, and it would otherwise be told the
 * job isn't theirs.
 *
 * Widening rather than exact, because `contains_text` is literal and clients
 * type their reference the way it appears on their paperwork, not the way the
 * board stores it. The caller still has to prove the card is theirs — this
 * finds candidates, it does not authorise anything.
 */
export async function findByRef(ref: string): Promise<MondayCard[]> {
  if (!MONDAY_READY) return [];
  const q = `
    query ($board: ID!, $rules: [ItemsQueryRule!]) {
      boards(ids: [$board]) {
        items_page(limit: 25, query_params: { rules: $rules }) {
          items { ${CARD_FIELDS} }
        }
      }
    }`;
  const seen = new Set<string>();
  const out: MondayCard[] = [];
  for (const term of refSearchTerms(ref)) {
    try {
      const d = await gql<{ boards: { items_page: { items: Record<string, unknown>[] } }[] }>(
        q,
        {
          board: env.mondayBoardId,
          rules: [{ column_id: COL.ref, compare_value: [term], operator: "contains_text" }],
        }
      );
      for (const it of d.boards?.[0]?.items_page?.items || []) {
        const c = readCard(it);
        if (seen.has(c.itemId)) continue;
        seen.add(c.itemId);
        out.push(c);
      }
    } catch (e) {
      console.warn(`monday: ref search failed for ${JSON.stringify(term)}:`, (e as Error).message);
    }
    // Stop as soon as the exact reference is in hand — no need to widen, and
    // widening past a precise hit is how you pick up a neighbouring job.
    if (out.some((c) => sameRef(c.ref, ref))) break;
  }
  return out.filter((c) => sameRef(c.ref, ref));
}

/**
 * Every card on the board, closed ones included.
 *
 * Only used to build the past-jobs index — the thing that lets a client pick a
 * job we finished years ago instead of typing its reference from memory. Eight
 * pages on a board of 3,856, run once for all clients rather than once each,
 * and never on a request a person is waiting for.
 */
export async function listAllCards(): Promise<MondayCard[]> {
  if (!MONDAY_READY) return [];
  const out: MondayCard[] = [];
  const d = await gql<{ boards: { items_page: { cursor: string | null; items: Record<string, unknown>[] } }[] }>(
    `query ($board: ID!) {
       boards(ids: [$board]) {
         items_page(limit: 500) { cursor items { ${CARD_FIELDS} } } } }`,
    { board: env.mondayBoardId }
  );
  const page = d.boards?.[0]?.items_page;
  for (const it of page?.items || []) out.push(readCard(it));
  let cursor = page?.cursor ?? null;

  // A hard stop, not a expectation. A paging bug that never returns a null
  // cursor would otherwise walk until the function times out.
  for (let guard = 0; cursor && guard < 40; guard++) {
    const nxt: { next_items_page: { cursor: string | null; items: Record<string, unknown>[] } } =
      await gql(
        `query ($c: String!) {
           next_items_page(cursor: $c, limit: 500) { cursor items { ${CARD_FIELDS} } } }`,
        { c: cursor }
      );
    for (const it of nxt.next_items_page?.items || []) out.push(readCard(it));
    cursor = nxt.next_items_page?.cursor ?? null;
  }
  return out;
}

const CLOSED_LABELS = ["Invoiced / Completed", "Cancelled"];

/**
 * The label indexes for the closed statuses, read off the board.
 *
 * Filtering has to be done by INDEX — Monday's status rules ignore label text
 * and fail silently when given it, which is its own trap: `any_of` with text
 * matches nothing and `not_any_of` with text matches everything. So the
 * indexes are looked up rather than hard-coded, and if the labels can't be
 * found the caller walks the whole board like it always did. A filter that
 * might exclude the wrong cards is worse than no filter: it would make live
 * jobs disappear from clients' portals.
 */
async function closedIndexes(): Promise<number[] | null> {
  try {
    const d = await gql<{ boards: { columns: { settings_str: string }[] }[] }>(
      `query ($board: ID!) {
         boards(ids: [$board]) { columns(ids: ["${COL.status}"]) { settings_str } } }`,
      { board: env.mondayBoardId }
    );
    const labels = (JSON.parse(d.boards?.[0]?.columns?.[0]?.settings_str || "{}")
      .labels || {}) as Record<string, string>;
    const key = (x: string) => x.trim().toLowerCase().replace(/\s+/g, " ");
    const want = new Set(CLOSED_LABELS.map(key));
    const found = Object.entries(labels)
      .filter(([, name]) => want.has(key(name || "")))
      .map(([i]) => Number(i))
      .filter(Number.isFinite);
    // Every closed label has to be accounted for, or the filter would let
    // closed cards through and we'd be walking most of the board anyway.
    return found.length === CLOSED_LABELS.length ? found : null;
  } catch (e) {
    console.warn("monday: couldn't read the status labels, walking the whole board:", (e as Error).message);
    return null;
  }
}

/**
 * Active cards for the in-progress view — everything except closed states.
 *
 * Asked of the board rather than filtered here. On the live board that is 230
 * items instead of 3,827, which is one query every five minutes instead of
 * sixteen. The client-side check below stays as a second gate: cheap, and it
 * means a filter that drifts can only ever cost us efficiency, never
 * correctness.
 */
export async function listActive(): Promise<MondayCard[]> {
  if (!MONDAY_READY) return [];
  const closedIdx = await closedIndexes();

  const first = closedIdx
    ? `query ($board: ID!, $rules: [ItemsQueryRule!]) {
         boards(ids: [$board]) {
           items_page(limit: 500, query_params: { rules: $rules }) {
             cursor items { ${CARD_FIELDS} } } } }`
    : `query ($board: ID!) {
         boards(ids: [$board]) {
           items_page(limit: 250) { cursor items { ${CARD_FIELDS} } } } }`;

  const out: MondayCard[] = [];
  const take = (items: Record<string, unknown>[]) => {
    for (const it of items) {
      const c = readCard(it);
      if (!CLOSED_LABELS.some((l) => l.toLowerCase() === (c.status || "").trim().toLowerCase())) {
        out.push(c);
      }
    }
  };

  const d = await gql<{ boards: { items_page: { cursor: string | null; items: Record<string, unknown>[] } }[] }>(
    first,
    closedIdx
      ? { board: env.mondayBoardId,
          rules: [{ column_id: COL.status, compare_value: closedIdx, operator: "not_any_of" }] }
      : { board: env.mondayBoardId }
  );
  const page = d.boards?.[0]?.items_page;
  take(page?.items || []);

  // Later pages travel on the cursor alone — it carries the query with it.
  let cursor = page?.cursor ?? null;
  while (cursor) {
    const nxt: { next_items_page: { cursor: string | null; items: Record<string, unknown>[] } } =
      await gql(
        `query ($c: String!) {
           next_items_page(cursor: $c, limit: 500) { cursor items { ${CARD_FIELDS} } } }`,
        { c: cursor }
      );
    take(nxt.next_items_page?.items || []);
    cursor = nxt.next_items_page?.cursor ?? null;
  }
  return out;
}

/** Create a card from an accepted submission. Returns the new item id. */
export async function createCard(input: {
  address: string; clientName: string; email: string; description: string; jobClass?: string;
}): Promise<string> {
  if (!MONDAY_READY) return "demo-" + Math.random().toString(36).slice(2, 8);
  const values: Record<string, unknown> = {
    [COL.client]: input.clientName,
    [COL.email]: input.email ? { email: input.email, text: input.email } : "",
    [COL.description]: input.description,
    // Stamp the PORTAL column LODGED at creation, so the board shows which
    // jobs came through the portal from the moment they land — the thing the
    // office needs to know before a job is issued (a portal client can be sent
    // an FIR through the portal; an email/manual job can't). It's the lowest
    // rung of the delivery ladder, so the job climbs off it to ISSUED normally.
    [COL.portal]: { label: env.portalLodgedLabel },
  };
  // Set the Class column from the client's selection. create_labels_if_missing
  // means an unseen label (e.g. a new CBC variant) is added rather than erroring.
  if (input.jobClass) values[COL.class] = { label: input.jobClass };

  const q = `
    mutation ($board: ID!, $group: String!, $name: String!, $vals: JSON!) {
      create_item(board_id: $board, group_id: $group, item_name: $name,
                  column_values: $vals, create_labels_if_missing: true) { id }
    }`;
  const d = await gql<{ create_item: { id: string } }>(q, {
    board: env.mondayBoardId,
    group: env.mondayNewGroup,
    name: input.address || input.clientName || "New job",
    vals: JSON.stringify(values),
  });
  return d.create_item.id;
}

// ---------------------------------------------------------------------------
// Writing the main status column.
//
// The board is the office's working record of ~3,700 jobs, so a status write
// from the portal is deliberately timid. It reads the column's real labels and
// the card's current status first, and only writes when both say it should.
// `create_labels_if_missing` is OFF: the portal must never add a label to the
// firm's board, so an unknown label is a skip the caller can log, not a guess.
// ---------------------------------------------------------------------------

export type StatusWrite =
  /** Written. */
  | { ok: true }
  /** Demo mode, or no Monday token — nothing was sent anywhere. */
  | { ok: false; reason: "off" }
  /** The board's status column has no such label. `labels` is what it does have. */
  | { ok: false; reason: "no-such-label"; labels: string[] }
  /** The card is no longer at a status we're willing to move it from. */
  | { ok: false; reason: "moved-on"; status: string };

/** Labels defined on the board's main status column, in one call with the
 *  card's current status so a write costs one read, not two. Blank slots (a
 *  status column always has unused indices) are dropped. */
async function statusContext(itemId: string): Promise<{ labels: string[]; status: string }> {
  const q = `
    query ($board: ID!, $item: ID!) {
      boards(ids: [$board]) { columns(ids: ["${COL.status}"]) { settings_str } }
      items(ids: [$item]) { column_values(ids: ["${COL.status}"]) { text } }
    }`;
  const d = await gql<{
    boards: { columns: { settings_str: string }[] }[];
    items: { column_values: { text: string | null }[] }[];
  }>(q, { board: env.mondayBoardId, item: itemId });

  const raw = d.boards?.[0]?.columns?.[0]?.settings_str || "{}";
  const parsed = JSON.parse(raw) as { labels?: Record<string, string> };
  const labels = Object.values(parsed.labels || {})
    .map((l) => (l || "").trim())
    .filter(Boolean);
  const status = (d.items?.[0]?.column_values?.[0]?.text || "").trim();
  return { labels, status };
}

/** Board labels on the main status column. Exposed so callers can report what
 *  the column actually offers when a label they wanted isn't there. */
export async function statusLabels(): Promise<string[]> {
  if (!MONDAY_READY) return [];
  const q = `
    query ($board: ID!) {
      boards(ids: [$board]) { columns(ids: ["${COL.status}"]) { settings_str } }
    }`;
  const d = await gql<{ boards: { columns: { settings_str: string }[] }[] }>(
    q, { board: env.mondayBoardId });
  const parsed = JSON.parse(d.boards?.[0]?.columns?.[0]?.settings_str || "{}") as
    { labels?: Record<string, string> };
  return Object.values(parsed.labels || {}).map((l) => (l || "").trim()).filter(Boolean);
}

/**
 * Move a card's main status to `label`.
 *
 * `onlyWhenAt`, when given, is the set of statuses we're prepared to move the
 * card FROM — read live from the board rather than from the portal's copy, so
 * a card the office moved on since the last sync is left where it is.
 */
export async function setStatus(
  itemId: string, label: string, onlyWhenAt?: string[]
): Promise<StatusWrite> {
  if (!CAN_WRITE) return { ok: false, reason: "off" };

  const { labels, status } = await statusContext(itemId);
  // Compared loosely on purpose: the board's labels are typed by people and
  // don't stay in one case — QUERY is in capitals, KACIE DOCS too. An exact
  // match here would silently refuse to write.
  const key = (x: string) => x.trim().toLowerCase().replace(/\s+/g, " ");
  const onBoard = labels.find((l) => key(l) === key(label));
  if (!onBoard) return { ok: false, reason: "no-such-label", labels };
  if (onlyWhenAt && !onlyWhenAt.some((s) => key(s) === key(status))) {
    return { ok: false, reason: "moved-on", status };
  }
  if (key(status) === key(label)) return { ok: true }; // already there

  const q = `
    mutation ($board: ID!, $item: ID!, $col: String!, $val: JSON!) {
      change_column_value(board_id: $board, item_id: $item, column_id: $col,
                          value: $val, create_labels_if_missing: false) { id }
    }`;
  await gql(q, {
    board: env.mondayBoardId,
    item: itemId,
    col: COL.status,
    val: JSON.stringify({ label: onBoard }),
  });
  return { ok: true };
}

/**
 * A client has answered a request for information: move the card off the
 * waiting status so it lands back in the assessment queue.
 *
 * Guarded by AWAITING_REPLY_STATUSES, so a reply on a job nobody was waiting
 * on leaves the card exactly where the office put it.
 */
export async function markInfoReceived(itemId: string): Promise<StatusWrite> {
  return setStatus(itemId, INFO_RECEIVED_STATUS, [...AWAITING_REPLY_STATUSES.values()]);
}

/**
 * Who signed the certificate on a card, straight off the board.
 *
 * Read live rather than remembered on the job row: an amendment is rare enough
 * that one query costs nothing, and reading it now means it's the answer as at
 * today rather than as at whenever the sync last looked. Returns "" when the
 * column is empty or unreadable, which the caller treats as "unallocated" —
 * never as an error worth stopping for.
 */
export async function certifiedBy(itemId: string): Promise<string> {
  if (!MONDAY_READY) return "";
  try {
    const d = await gql<{ items: { column_values: { text: string | null }[] }[] }>(
      `query ($item: [ID!]) {
         items(ids: $item) { column_values(ids: ["${COL.certifiedBy}"]) { text } } }`,
      { item: [itemId] }
    );
    return (d.items?.[0]?.column_values?.[0]?.text || "").trim();
  } catch (e) {
    console.warn(`monday: couldn't read Certified By for ${itemId}:`, (e as Error).message);
    return "";
  }
}

/** Post a note into the card's Updates (conversation) section — not a column.
 *  Returns the new update id so files can be attached to it. */
export async function postUpdate(itemId: string, body: string): Promise<string | null> {
  if (!MONDAY_READY) return null;
  const q = `
    mutation ($item: ID!, $body: String!) {
      create_update(item_id: $item, body: $body) { id }
    }`;
  const d = await gql<{ create_update: { id: string } }>(q, { item: itemId, body });
  return d.create_update?.id ?? null;
}

/** Attach a file to an update, so a client's engineering PDF lands on the card
 *  itself rather than only in the portal. Uses Monday's multipart file
 *  endpoint, which is separate from the GraphQL endpoint above. */
/** Attach a file to the card's Files column — where the office expects the
 *  lodged documents, alongside everything else filed against the job. */
export async function addFileToColumn(
  itemId: string, filename: string, bytes: Buffer, contentType: string
): Promise<void> {
  if (!MONDAY_READY) return;
  const form = new FormData();
  form.set("query",
    `mutation ($item: ID!, $col: String!, $file: File!) {
       add_file_to_column(item_id: $item, column_id: $col, file: $file) { id }
     }`);
  form.set("variables", JSON.stringify({ item: itemId, col: COL.files, file: null }));
  form.set("map", JSON.stringify({ image: "variables.file" }));
  form.set("image", new Blob([new Uint8Array(bytes)], { type: contentType }), filename);

  const r = await fetch("https://api.monday.com/v2/file", {
    method: "POST",
    headers: { Authorization: env.mondayToken, "API-Version": "2024-10" },
    body: form,
  });
  const j = await r.json().catch(() => ({}));
  if (j.errors) throw new Error("Monday file->column upload: " + JSON.stringify(j.errors));
}

export async function addFileToUpdate(
  updateId: string, filename: string, bytes: Buffer, contentType: string
): Promise<void> {
  if (!MONDAY_READY) return;
  const form = new FormData();
  form.set("query",
    `mutation ($update: ID!, $file: File!) {
       add_file_to_update(update_id: $update, file: $file) { id }
     }`);
  form.set("variables", JSON.stringify({ update: updateId, file: null }));
  form.set("map", JSON.stringify({ image: "variables.file" }));
  form.set("image", new Blob([new Uint8Array(bytes)], { type: contentType }), filename);

  const r = await fetch("https://api.monday.com/v2/file", {
    method: "POST",
    headers: { Authorization: env.mondayToken, "API-Version": "2024-10" },
    body: form,
  });
  const j = await r.json().catch(() => ({}));
  if (j.errors) throw new Error("Monday file upload: " + JSON.stringify(j.errors));
}

export interface MondayUpdate {
  id: string;
  itemId: string;
  text: string;
  createdAt: string;
  creator: string;
}

/** Updates for a batch of cards. Monday accepts up to ~100 ids per query; 25
 *  keeps each response small enough to stay inside the complexity budget. */
export async function listUpdates(itemIds: string[]): Promise<MondayUpdate[]> {
  if (!MONDAY_READY || itemIds.length === 0) return [];
  const out: MondayUpdate[] = [];
  for (let i = 0; i < itemIds.length; i += 25) {
    const batch = itemIds.slice(i, i + 25);
    const q = `
      query ($ids: [ID!]) {
        items(ids: $ids) {
          id
          updates(limit: 50) { id text_body created_at creator { name } }
        }
      }`;
    const d = await gql<{ items: Record<string, unknown>[] }>(q, { ids: batch });
    for (const it of d.items || []) {
      for (const u of (it.updates as Record<string, unknown>[]) || []) {
        out.push({
          id: String(u.id),
          itemId: String(it.id),
          text: ((u.text_body as string) || "").trim(),
          createdAt: (u.created_at as string) || new Date().toISOString(),
          creator: ((u.creator as { name?: string })?.name) || "CF Building Approvals",
        });
      }
    }
  }
  return out;
}

export type PortalWrite =
  | { ok: true; wrote: boolean; skipped?: "already" | "unknown" }
  | { ok: false; reason: "off" | "failed"; detail?: string };

/** The ladder as this deployment's board spells it. See lib/core.mjs. */
const LADDER = portalLadder(
  env.portalIssuedLabel, env.portalReadyLabel, env.portalDownloadedLabel,
  env.portalLodgedLabel
);

/**
 * Move a card along the PORTAL column — forward only, never backwards, never
 * creating a label the board doesn't already carry. STUCK is the exception
 * both ways: it can replace a rung, and a rung can replace it.
 *
 * Never throws. Nothing here is worth costing a client their files or an
 * office their sync run: a board that is down is something to read in the log
 * and in the evening report.
 */
async function markPortal(itemId: string, target: string): Promise<PortalWrite> {
  if (!CAN_WRITE) return { ok: false, reason: "off" };
  try {
    const board = env.mondayBoardId;
    const read = `query ($ids: [ID!]) {
      items (ids: $ids) { column_values (ids: ["${COL.portal}"]) { id text } } }`;
    const got = await gql<{ items: { column_values: { id: string; text: string | null }[] }[] }>(
      read, { ids: [itemId] });
    const current =
      (got.items?.[0]?.column_values || []).find((c) => c.id === COL.portal)?.text || "";

    const decision = portalColumnWrite(current, target, LADDER, env.portalStuckLabel);
    if (decision === "already") return { ok: true, wrote: false, skipped: "already" };
    if (decision === "unknown") {
      console.info(
        `monday: ${itemId} PORTAL reads "${current}", which isn't on the ladder ` +
        `(${LADDER.join(" → ")}, or ${env.portalStuckLabel}) — left as the office has it.`
      );
      return { ok: true, wrote: false, skipped: "unknown" };
    }
    if (decision === "unknown-target") {
      return { ok: false, reason: "failed", detail: `"${target}" isn't a PORTAL label` };
    }

    await gql(
      `mutation ($board: ID!, $item: ID!, $col: String!, $val: JSON!) {
         change_column_value(board_id: $board, item_id: $item, column_id: $col,
                             value: $val, create_labels_if_missing: false) { id }
       }`,
      { board, item: itemId, col: COL.portal, val: JSON.stringify({ label: target }) }
    );
    return { ok: true, wrote: true };
  } catch (e) {
    const detail = (e as Error).message;
    console.warn(`monday: could not move ${itemId} to ${target}:`, detail);
    return { ok: false, reason: "failed", detail };
  }
}

/** The portal has seen the card at Issued and is working on it. */
/** Stamp a portal-lodged card LODGED. Normally set at creation (see
 *  createCard); exposed so an existing portal job can be back-stamped too. */
export const markLodged = (itemId: string) => markPortal(itemId, env.portalLodgedLabel);

export const markIssued = (itemId: string) => markPortal(itemId, env.portalIssuedLabel);

/** The portal has the files and the client has been told. */
export const markReady = (itemId: string) => markPortal(itemId, env.portalReadyLabel);

/** The client has actually taken it. */
export const markDownloaded = (itemId: string) => markPortal(itemId, env.portalDownloadedLabel);

/** Something has gone wrong and a human needs to look. Reversible: whichever
 *  rung the job reaches next clears it. */
export const markStuck = (itemId: string) => markPortal(itemId, env.portalStuckLabel);
