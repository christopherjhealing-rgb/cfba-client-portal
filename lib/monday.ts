// Monday client. Reads the board for status and writes a new card when a
// portal submission is accepted. Column ids match the live CFBA / EWA board.
import { env, MONDAY_READY } from "./env";

const API = "https://api.monday.com/v2";

const COL = {
  status: "status",
  class: "status_1__1",
  client: "client__1",
  email: "email_mkspqm6m",
  ref: "text__1",
  description: "text0__1",
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
  };
}

const CARD_FIELDS = `id name column_values(ids:["${COL.status}","${COL.client}","${COL.email}","${COL.ref}","${COL.description}"]){ id text }`;

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
