"use client";
import {
  JOB_CLASSES, OTHER, MAX_ITEMS, MAX_QTY, MAX_TEXT,
  classByKey, hasTypes, describeJob, type JobItem,
} from "@/lib/jobdesc.mjs";
import { Icon } from "./Icon";

/**
 * What's being built.
 *
 * One row per structure: the class, what it is, and how many. A job with a
 * shed and a retaining wall is two rows and two classes, which is what such a
 * job actually is — the old single dropdown couldn't say it, so it came in as
 * free text and the board's Description column ended up unreadable.
 *
 * The preview at the foot is the point of the whole thing. It's the exact
 * string the board will get, built by the same function the server uses, so
 * the client sees what we'll see before they lodge. The server re-derives it
 * from the rows regardless — this is a window, not the source.
 */
export type Item = JobItem;

export const blankItem = (): Item =>
  ({ classKey: "10a", type: "Steel Patio", text: "", qty: 1 });

/** The type a row should fall to when its class changes: the class's first
 *  type, or free text where it hasn't got a list. */
const firstType = (classKey: string) =>
  classByKey(classKey)?.types[0]?.label ?? OTHER;

export function JobItems({
  items, onChange,
}: {
  items: Item[];
  onChange: (next: Item[]) => void;
}) {
  const set = (i: number, patch: Partial<Item>) =>
    onChange(items.map((it, n) => (n === i ? { ...it, ...patch } : it)));

  const add = () => onChange([...items, blankItem()]);
  const remove = (i: number) => onChange(items.filter((_, n) => n !== i));

  // Not a lookalike of what the server will do — literally the same call, so
  // the preview can't drift from the record. Rows the server would drop (an
  // "Other" with nothing typed in it yet) drop out here for the same reason.
  const said = describeJob(items);

  return (
    <div>
      <p className="label">What&apos;s Being Built</p>
      <p className="mb-3 text-[13px] leading-relaxed text-ink/60">
        One row per structure. Add a row for each one — a shed and a retaining
        wall are two different classes, and we need both on the job.
      </p>

      <div className="space-y-2.5">
        {items.map((it, i) => {
          const c = classByKey(it.classKey);
          const other = it.type === OTHER || !hasTypes(it.classKey);
          return (
            <div key={i} className="rounded-lg border border-rule bg-white p-3">
              <div className="flex flex-wrap items-start gap-2.5 sm:flex-nowrap">
                <div className="min-w-[150px] flex-1">
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.08em] text-ink/60"
                    htmlFor={`class-${i}`}>Class</label>
                  <select id={`class-${i}`} value={it.classKey}
                    onChange={(e) => set(i, {
                      classKey: e.target.value,
                      type: firstType(e.target.value),
                      text: "",
                    })}
                    className="field py-2 text-[14px]">
                    {JOB_CLASSES.map((k) => (
                      <option key={k.key} value={k.key}>{k.label}</option>
                    ))}
                  </select>
                </div>

                <div className="min-w-[150px] flex-1">
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.08em] text-ink/60"
                    htmlFor={`type-${i}`}>What Is It?</label>
                  {hasTypes(it.classKey) ? (
                    <select id={`type-${i}`} value={it.type}
                      onChange={(e) => set(i, { type: e.target.value, text: "" })}
                      className="field py-2 text-[14px]">
                      {c?.types.map((t) => (
                        <option key={t.label} value={t.label}>{t.label}</option>
                      ))}
                      <option value={OTHER}>{OTHER}…</option>
                    </select>
                  ) : (
                    <input id={`type-${i}`} value={it.text} maxLength={MAX_TEXT}
                      onChange={(e) => set(i, { type: OTHER, text: e.target.value })}
                      className="field py-2 text-[14px]"
                      placeholder="Describe the work" />
                  )}
                </div>

                <div className="w-[86px] shrink-0">
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.08em] text-ink/60"
                    htmlFor={`qty-${i}`}>How Many</label>
                  <input id={`qty-${i}`} type="number" min={1} max={MAX_QTY}
                    value={it.qty}
                    onChange={(e) => set(i, { qty: Number(e.target.value) || 1 })}
                    className="field py-2 text-[14px]" />
                </div>

                {/* Never on the last row standing — a lodgement with nothing
                    on it isn't a state the form should be able to reach. */}
                {items.length > 1 && (
                  <button type="button" onClick={() => remove(i)}
                    aria-label={`Remove row ${i + 1}`}
                    className="mt-[22px] grid h-9 w-9 shrink-0 place-items-center rounded-md border border-rule text-ink/60 transition hover:border-flag/40 hover:bg-wash hover:text-flag">
                    <Icon name="close" size={15} />
                  </button>
                )}
              </div>

              {/* Free text under a class that has a list — the escape hatch. */}
              {other && hasTypes(it.classKey) && (
                <input value={it.text} maxLength={MAX_TEXT}
                  onChange={(e) => set(i, { text: e.target.value })}
                  className="field mt-2.5 py-2 text-[14px]"
                  placeholder="What is it? — e.g. Timber pergola" />
              )}
            </div>
          );
        })}
      </div>

      {items.length < MAX_ITEMS ? (
        <button type="button" onClick={add} className="btn-ghost mt-2.5">
          <Icon name="plus" size={14} /> Add Another
        </button>
      ) : (
        <p className="mt-2 text-[12px] text-ink/60">
          That&apos;s {MAX_ITEMS} — put anything else in the notes and we&apos;ll
          add it to the job.
        </p>
      )}

      {/* Exactly what lands on the board. */}
      <div className="mt-3 rounded-lg border border-rule bg-wash px-4 py-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink/60">
          We&apos;ll Record This As
        </p>
        {said.ok ? (
          <>
            <p className="mt-1 text-[14px] font-medium leading-snug text-ink">{said.description}</p>
            <p className="mt-0.5 text-[12.5px] text-ink/60">Class: {said.jobClass}</p>
          </>
        ) : (
          <p className="mt-1 text-[13.5px] text-ink/60">
            Fill in a row and it appears here.
          </p>
        )}
      </div>
    </div>
  );
}
