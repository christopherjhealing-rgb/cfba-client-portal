"use client";
import { useState } from "react";
import type { SpanSet } from "@/lib/engineering";

/** Interactive span lookup: set → member → wind class → section → limit.
 *  Pure lookup against the tables passed in — no calculation, so the answer
 *  can never be "better" than the published table. */
export function SpanChecker({ sets }: { sets: SpanSet[] }) {
  const [setKey, setSetKey] = useState(sets[0]?.key || "");
  const set = sets.find((s) => s.key === setKey) || sets[0];
  const [tableKey, setTableKey] = useState(set?.tables[0]?.key || "");
  const table = set?.tables.find((t) => t.key === tableKey) || set?.tables[0];
  const [wind, setWind] = useState(0);
  const [rowIdx, setRowIdx] = useState(0);

  if (!set || !table) return null;
  const row = table.rows[Math.min(rowIdx, table.rows.length - 1)];
  const windIdx = Math.min(wind, table.windClasses.length - 1);
  const limit = row?.spans[windIdx];

  return (
    <div>
      {set.sample && (
        <div className="mb-4 rounded-lg border border-brass/40 bg-[#FBF4E6] px-4 py-3 text-[13px] text-brass">
          <strong>Sample tables — demonstration only.</strong> {set.note}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {sets.length > 1 && (
          <label className="block">
            <span className="label">Table set</span>
            <select className="field" value={setKey}
              onChange={(e) => { setSetKey(e.target.value); setTableKey(""); setRowIdx(0); }}>
              {sets.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}
            </select>
          </label>
        )}
        <label className="block">
          <span className="label">Member</span>
          <select className="field" value={table.key}
            onChange={(e) => { setTableKey(e.target.value); setRowIdx(0); }}>
            {set.tables.map((t) => <option key={t.key} value={t.key}>{t.member}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">Wind class</span>
          <select className="field" value={windIdx}
            onChange={(e) => setWind(Number(e.target.value))}>
            {table.windClasses.map((w, i) => <option key={w} value={i}>{w}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">Section</span>
          <select className="field" value={rowIdx}
            onChange={(e) => setRowIdx(Number(e.target.value))}>
            {table.rows.map((r, i) => <option key={r.section} value={i}>{r.section}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-4 rounded-lg border border-seal/30 bg-[#EDF3EE] px-5 py-4">
        <p className="text-[13px] text-ink/60">
          {row?.section} · {table.windClasses[windIdx]} · {table.member}
        </p>
        <p className="mt-1 font-display text-[26px] font-semibold text-seal">
          {limit != null ? `${limit.toFixed(1)} ${table.unit}` : "Not listed — ask us"}
        </p>
        {table.note && <p className="mt-1 text-[12.5px] text-ink/50">{table.note}</p>}
      </div>

      <div className="mt-6">
        <h2 className="mb-2 font-display text-[12px] font-semibold uppercase tracking-[0.15em] text-ink/70">
          Full table — {table.member}
        </h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="border-b border-rule text-left">
                <th className="px-3.5 py-2.5 font-display text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/60">Section</th>
                {table.windClasses.map((w) => (
                  <th key={w} className="px-3.5 py-2.5 font-display text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/60">
                    {w} ({table.unit})
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {table.rows.map((r, i) => (
                <tr key={r.section} className={i === rowIdx ? "bg-wash/60" : ""}>
                  <td className="px-3.5 py-2 font-medium">{r.section}</td>
                  {r.spans.map((s, j) => (
                    <td key={j} className={`px-3.5 py-2 ${j === windIdx && i === rowIdx ? "font-semibold text-seal" : "text-ink/70"}`}>
                      {s != null ? s.toFixed(1) : "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
