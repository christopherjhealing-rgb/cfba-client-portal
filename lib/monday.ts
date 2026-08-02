// Monday client. Reads the board for status and writes a new card when a
// portal submission is accepted. Column ids match the live CFBA / EWA board.
import { env, MONDAY_READY, DEMO_MODE } from "./env";
import { sendColumnWrite, SEND_SENT } from "./core.mjs";

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
  // "Send?" (NO / YES / SENT) and its date partner "Job Sent". These are the
  // office's own record of the package reaching the client — not the main
  // Status column, which tracks the assessment and has no Sent label.
  sendStatus: "status_16__1",
  sentDate: "date__1",
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

/** Cards currently sitting at a given status label (default: Issued). */
export async function listByStatus(label: string): Promise<MondayCard[]> {
  if (!MONDAY_READY) return [];
  const q = `
    query ($board: ID!, $col: String!, $vals: [String]!) {
      items_page_by_column_values(limit: 500, board_id: $board,
        columns: [{ column_id: $col, column_values: $vals }]) {
        items { ${CARD_FIELDS} }
      }
    }`;
  const d = await gql<{ items_page_by_column_values: { items: Record<string, unknown>[] } }>(
    q, { board: env.mondayBoardId, col: COL.status, vals: [label] });
  return (d.items_page_by_column_values?.items || []).map(readCard);
}

/** Active cards for the in-progress view — everything except closed states. */
export async function listActive(): Promise<MondayCard[]> {
  if (!MONDAY_READY) return [];
  const closed = ["Invoiced / Completed", "Cancelled"];
  const q = `
    query ($board: ID!, $cursor: String) {
      boards(ids: [$board]) {
        items_page(limit: 250, cursor: $cursor) { cursor items { ${CARD_FIELDS} } }
      }
    }`;
  const out: MondayCard[] = [];
  let cursor: string | null = null;
  do {
    const d: { boards: { items_page: { cursor: string | null; items: Record<string, unknown>[] } }[] } =
      await gql(q, { board: env.mondayBoardId, cursor });
    const page = d.boards[0].items_page;
    for (const it of page.items) {
      const c = readCard(it);
      if (!closed.includes(c.status)) out.push(c);
    }
    cursor = page.cursor;
  } while (cursor);
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
  if (!labels.includes(label)) return { ok: false, reason: "no-such-label", labels };
  if (onlyWhenAt && !onlyWhenAt.includes(status)) {
    return { ok: false, reason: "moved-on", status };
  }
  if (status === label) return { ok: true }; // already there — no need to write

  const q = `
    mutation ($board: ID!, $item: ID!, $col: String!, $val: JSON!) {
      change_column_value(board_id: $board, item_id: $item, column_id: $col,
                          value: $val, create_labels_if_missing: false) { id }
    }`;
  await gql(q, {
    board: env.mondayBoardId,
    item: itemId,
    col: COL.status,
    val: JSON.stringify({ label }),
  });
  return { ok: true };
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

/** Mark the card as delivered: "Send?" -> SENT and "Job Sent" -> today.
 *
 *  The office tracks delivery in its own pair of columns, separate from the
 *  Status column that follows the assessment. Whichever happens first — the
 *  portal emailing the client that it's ready, or the client downloading it —
 *  is the moment the package reached them, so either can call this. Writing
 *  SENT twice is a no-op.
 *
 *  Never throws: a card that won't take the write must not cost the client
 *  their download or their email. */
export type SendWrite =
  | { ok: true; wrote: boolean }
  | { ok: false; reason: "off" | "failed"; detail?: string };

/**
 * Mark a card as sent on the board's "Send?" column, and stamp "Job Sent".
 *
 * Called from two places — the issued email going out, and the client
 * downloading the package — because either one means the client has it, and
 * whichever happens first should be what the board shows.
 *
 * Never throws. Nothing here is worth costing a client their files or an
 * office their sync run: a board that is down is something to read in the log.
 */
export async function markSent(itemId: string): Promise<SendWrite> {
  if (!CAN_WRITE) return { ok: false, reason: "off" };
  try {
    const board = env.mondayBoardId;
    const read = `query ($ids: [ID!]) {
      items (ids: $ids) { column_values (ids: ["${COL.sendStatus}"]) { text } } }`;
    const got = await gql<{ items: { column_values: { text: string | null }[] }[] }>(
      read, { ids: [itemId] });
    const current = got.items?.[0]?.column_values?.[0]?.text || "";
    if (sendColumnWrite(current) === "already") return { ok: true, wrote: false };

    const q = `
      mutation ($board: ID!, $item: ID!, $col: String!, $val: JSON!) {
        change_column_value(board_id: $board, item_id: $item, column_id: $col,
                            value: $val, create_labels_if_missing: false) { id }
      }`;
    await gql(q, {
      board, item: itemId, col: COL.sendStatus,
      val: JSON.stringify({ label: SEND_SENT }),
    });
    // The date is a nicety — if it fails, SENT is still on the board.
    // Perth, not UTC: before 8am here the UTC date is still yesterday, and a
    // board that says a job went out the day before it did is worse than no
    // date at all.
    try {
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Australia/Perth",
      }).format(new Date());
      await gql(q, {
        board, item: itemId, col: COL.sentDate, val: JSON.stringify({ date: today }),
      });
    } catch (e) {
      console.warn(`monday: Job Sent date not written for ${itemId}:`, (e as Error).message);
    }
    return { ok: true, wrote: true };
  } catch (e) {
    const detail = (e as Error).message;
    console.warn(`monday: could not mark ${itemId} SENT:`, detail);
    return { ok: false, reason: "failed", detail };
  }
}
