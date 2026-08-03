"use client";
import { useMemo, useState } from "react";
import { composeFir, type FirItem } from "@/lib/fir.mjs";

export type FirRow = FirItem & { shipped: boolean; edited: boolean; disabled: boolean };

/**
 * The library, as the people typing into Monday need it.
 *
 * Built around looking a shortcut up rather than around editing one: the thing
 * somebody does forty times a week is find the word, and the thing they do
 * twice a year is change the wording. So search is at the top and always
 * focused, every row shows its shortcut in monospace at the size you can read
 * across a desk, and editing is folded away behind a link.
 */
export function FirLibrary({ rows: initial }: { rows: FirRow[] }) {
  const [rows, setRows] = useState(initial);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<{ good: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Search the shortcut, its aliases and its wording — somebody who remembers
  // "the one about the non-climbable zone" should find it without the code.
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      [r.code, r.title, r.body, ...(r.aliases || [])]
        .join(" ").toLowerCase().includes(needle));
  }, [rows, q]);

  const live = rows.filter((r) => !r.disabled).length;

  async function post(body: unknown, ok: string) {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/admin/fir", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg({ good: false, text: d.error || "That didn't work." }); return false; }
    setMsg({ good: true, text: ok });
    return true;
  }

  async function save(code: string, title: string, text: string) {
    if (!(await post({ action: "edit", code, title, body: text }, "Saved."))) return;
    setRows((rs) => rs.map((r) =>
      r.code === code ? { ...r, title, body: text, edited: true } : r));
    setOpen(null);
  }

  async function revert(code: string, shippedTitle: string, shippedBody: string) {
    if (!(await post({ action: "edit", code, revert: true }, "Back to the shipped wording."))) return;
    setRows((rs) => rs.map((r) =>
      r.code === code ? { ...r, title: shippedTitle, body: shippedBody, edited: false } : r));
    setOpen(null);
  }

  async function toggle(code: string) {
    const row = rows.find((r) => r.code === code);
    if (!row) return;
    const to = !row.disabled;
    if (!(await post({ action: "toggle", code }, to ? "Switched off." : "Switched back on."))) return;
    setRows((rs) => rs.map((r) => (r.code === code ? { ...r, disabled: to } : r)));
  }

  async function remove(code: string) {
    if (!(await post({ action: "remove", code }, "Removed."))) return;
    setRows((rs) => rs.filter((r) => r.code !== code));
  }

  return (
    <>
      {/* How it works, because the whole feature is invisible until somebody
          knows the convention exists. */}
      <div className="card mb-6 p-5">
        <h2 className="font-display text-[12px] font-semibold uppercase tracking-[0.15em] text-ink/70">
          How to use it
        </h2>
        <p className="mt-2 max-w-3xl text-[13.5px] leading-relaxed text-ink/70">
          Post an update on the Monday card starting with <span className="font-mono">FIR:</span> and
          then a shortcut. The portal writes the full request, sends it to the client, emails
          them, and posts back on the card saying what went.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <Example code="FIR: Soil Class" note="One request." />
          <Example code="FIR: Soil Class, Elevations" note="One message, numbered." />
          <Example code="FIR: Please ring me about the setback" note="Not a shortcut — goes as written." />
        </div>
        <p className="mt-3 max-w-3xl text-[12.5px] leading-relaxed text-ink/55">
          Case, spacing and punctuation don&apos;t matter, and most shortcuts answer to
          several words. If something looks like a shortcut with a letter wrong —{" "}
          <span className="font-mono">Sol Class</span> — nothing is sent and the card gets a note
          asking which you meant. <strong>Nothing is sent to a client without a shortcut
          matching exactly.</strong>
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <input
            autoFocus value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search a shortcut, or what it asks for…"
            className="field w-full" />
        </div>
        <span className="font-mono text-[12px] text-ink/45">{live} live</span>
        <button className="btn-ghost" onClick={() => { setAdding((a) => !a); setOpen(null); }}>
          {adding ? "Cancel" : "Add One of Ours"}
        </button>
      </div>

      {msg && (
        <p className={`mb-3 text-[13px] ${msg.good ? "text-seal" : "text-flag"}`}>{msg.text}</p>
      )}

      {adding && (
        <AddForm busy={busy} onCancel={() => setAdding(false)}
          onAdd={async (item) => {
            if (!(await post({ action: "add", ...item }, "Added."))) return;
            setRows((rs) => [...rs, {
              ...item, group: "Ours", shipped: false, edited: false, disabled: false,
            } as FirRow]);
            setAdding(false);
          }} />
      )}

      <div className="card divide-y divide-rule">
        {shown.map((r) => (
          <Row key={r.code} row={r} busy={busy}
            open={open === r.code}
            onOpen={() => setOpen(open === r.code ? null : r.code)}
            onSave={save} onRevert={revert} onToggle={toggle} onRemove={remove} />
        ))}
        {!shown.length && (
          <p className="px-4 py-6 text-center text-[13px] text-ink/50">
            Nothing matches &ldquo;{q}&rdquo;.
          </p>
        )}
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */

function Example({ code, note }: { code: string; note: string }) {
  return (
    <div className="rounded-md border border-rule bg-wash px-3 py-2">
      <div className="font-mono text-[12.5px] text-seal">{code}</div>
      <div className="mt-0.5 text-[11.5px] text-ink/50">{note}</div>
    </div>
  );
}

function Row({
  row, open, busy, onOpen, onSave, onRevert, onToggle, onRemove,
}: {
  row: FirRow; open: boolean; busy: boolean; onOpen: () => void;
  onSave: (code: string, title: string, body: string) => void;
  onRevert: (code: string, title: string, body: string) => void;
  onToggle: (code: string) => void;
  onRemove: (code: string) => void;
}) {
  const [title, setTitle] = useState(row.title);
  const [body, setBody] = useState(row.body);
  // Kept so "put it back" doesn't need another round trip to find out what
  // the build actually says.
  const [shippedTitle] = useState(row.title);
  const [shippedBody] = useState(row.body);

  return (
    <div className={`px-4 py-3 ${row.disabled ? "opacity-55" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[13px] font-semibold text-seal">{row.code}</span>
            <span className="text-[14px] font-medium">{row.title}</span>
            {row.edited && <span className="chip chip-seal">Reworded</span>}
            {!row.shipped && <span className="chip">Ours</span>}
            {row.disabled && <span className="chip">Off</span>}
          </div>
          {!!row.aliases?.length && (
            <div className="mt-1 text-[12px] text-ink/45">
              also: {row.aliases.join(" · ")}
            </div>
          )}
          <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-ink/65">{row.body}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <button className="text-[13px] text-seal underline" onClick={onOpen}>
            {open ? "Close" : "Edit"}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-3 rounded-md border border-rule bg-wash p-4">
          {/* What the client will actually read, assembled the way the sync
              assembles it — so nobody has to send one to find out. */}
          <div className="mb-3">
            <span className="font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/50">
              What the client reads
            </span>
            <p className="mt-1 whitespace-pre-line rounded-md border border-rule bg-white px-3 py-2 text-[13px] leading-relaxed text-ink/75">
              {composeFir([{ ...row, body }], { address: "12 Example Street, Wanneroo" })}
            </p>
          </div>

          <label className="label" htmlFor={`t-${row.code}`}>Name</label>
          <input id={`t-${row.code}`} className="field mb-3" value={title}
            onChange={(e) => setTitle(e.target.value)} />

          <label className="label" htmlFor={`b-${row.code}`}>The request</label>
          <textarea id={`b-${row.code}`} rows={4} className="field"
            value={body} onChange={(e) => setBody(e.target.value)} />
          <p className="mt-1 text-[12px] text-ink/45">
            No greeting and no sign-off — the email already has both. Write the one thing
            being asked for, as you&apos;d say it.
          </p>

          <div className="mt-3 flex flex-wrap gap-2 border-t border-rule pt-3">
            <button className="btn" disabled={busy} onClick={() => onSave(row.code, title, body)}>
              Save
            </button>
            {row.shipped && row.edited && (
              <button className="btn-ghost" disabled={busy}
                onClick={() => onRevert(row.code, shippedTitle, shippedBody)}>
                Back to the Shipped Wording
              </button>
            )}
            {row.shipped ? (
              <button className="btn-ghost" disabled={busy} onClick={() => onToggle(row.code)}>
                {row.disabled ? "Switch It Back On" : "Switch It Off"}
              </button>
            ) : (
              <button className="btn-ghost text-flag" disabled={busy}
                onClick={() => onRemove(row.code)}>
                Remove
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AddForm({
  busy, onAdd, onCancel,
}: {
  busy: boolean;
  onAdd: (item: { code: string; title: string; body: string; aliases: string[] }) => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [aliases, setAliases] = useState("");

  return (
    <div className="card mb-4 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="new-code">Shortcut</label>
          <input id="new-code" className="field font-mono" value={code} placeholder="verge"
            onChange={(e) => setCode(e.target.value)} />
          <p className="mt-1 text-[12px] text-ink/45">What gets typed after FIR:. Keep it short.</p>
        </div>
        <div>
          <label className="label" htmlFor="new-title">Name</label>
          <input id="new-title" className="field" value={title} placeholder="Verge treatment"
            onChange={(e) => setTitle(e.target.value)} />
          <p className="mt-1 text-[12px] text-ink/45">What the card note calls it.</p>
        </div>
      </div>
      <div className="mt-3">
        <label className="label" htmlFor="new-alias">Other words for it</label>
        <input id="new-alias" className="field" value={aliases} placeholder="crossover, verge treatment"
          onChange={(e) => setAliases(e.target.value)} />
        <p className="mt-1 text-[12px] text-ink/45">
          Comma separated. Worth doing — it&apos;s what stops somebody having to remember
          which word we picked.
        </p>
      </div>
      <div className="mt-3">
        <label className="label" htmlFor="new-body">The request</label>
        <textarea id="new-body" rows={3} className="field" value={body}
          placeholder="Details of the proposed verge treatment and crossover, dimensioned on the site plan."
          onChange={(e) => setBody(e.target.value)} />
      </div>
      <div className="mt-3 flex gap-2">
        <button className="btn" disabled={busy}
          onClick={() => onAdd({
            code: code.trim(), title: title.trim(), body: body.trim(),
            aliases: aliases.split(",").map((a) => a.trim()).filter(Boolean),
          })}>
          Add It
        </button>
        <button className="btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
