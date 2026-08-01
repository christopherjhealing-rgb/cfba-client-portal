"use client";
import { useRef, useState } from "react";
import { Icon } from "./Icon";

export interface Bucket {
  key: string;
  label: string;
  hint: string;
  required?: boolean;
}

export function FileBucket({
  bucket, files, onChange,
}: {
  bucket: Bucket;
  files: File[];
  onChange: (files: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [leftOut, setLeftOut] = useState<string[]>([]);
  const missing = bucket.required && files.length === 0;

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault(); setOver(false);
        const dropped = Array.from(e.dataTransfer?.files || [])
          .filter((f) => /\.pdf$/i.test(f.name));
        const { keep, skip } = splitUnneeded(dropped);
        setLeftOut(skip);
        if (keep.length) onChange([...files, ...keep]);
      }}
      className={`rounded-lg border px-4 py-3.5 transition ${
      over ? "border-seal bg-[#EDF3EE] outline-dashed outline-2 outline-seal/40"
        : missing ? "border-rule bg-white" : "border-seal/35 bg-[#F4F8F4]"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-[13px] font-semibold text-ink">
            {bucket.label}
            {bucket.required && <span className="ml-1.5 text-flag">*</span>}
          </p>
          <p className="mt-0.5 text-[12px] leading-snug text-ink/55">{bucket.hint} PDF only — or drag them onto this box.</p>
        </div>
        <button type="button" onClick={() => input.current?.click()} className="btn-ghost shrink-0">
          {files.length ? "Change" : "Choose files"}
        </button>
      </div>

      <input ref={input} type="file" multiple accept="application/pdf,.pdf" className="hidden"
        onChange={(e) => {
          const picked = Array.from(e.target.files || []).filter((f) => /\.pdf$/i.test(f.name));
          const { keep, skip } = splitUnneeded(picked);
          setLeftOut(skip);
          onChange(keep);
        }} />

      {files.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-rule/70 pt-2.5">
          {files.map((f) => (
            <li key={f.name} className="flex items-center gap-2 text-[13px] text-ink/70">
              <span className="text-seal"><Icon name="check" size={13} /></span>
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className="shrink-0 font-mono text-[11px] text-ink/40">
                {(f.size / 1048576).toFixed(1)} MB
              </span>
            </li>
          ))}
        </ul>
      )}
      {leftOut.length > 0 && (
        <p className="mt-2.5 rounded-md bg-[#FBF4E6] px-3 py-2 text-[12px] leading-snug text-brass">
          Left out (not needed for certification): {leftOut.join(", ")}. We
          don&apos;t need the certificate of title or council application forms —
          those stay with you for the council.
        </p>
      )}
    </div>
  );
}

// Documents clients habitually include that certification never needs — the
// certificate of title and the council's own BA1 application. Matched by
// filename; anything ambiguous is kept (dropping a wanted file is worse than
// keeping a spare one).
const UNNEEDED = /certificate[\s_.-]*of[\s_.-]*title|cert[\s_.-]*of[\s_.-]*title|duplicate[\s_.-]*certificate|record[\s_.-]*of[\s_.-]*certificate[\s_.-]*of[\s_.-]*title|\bba[\s_.-]?0?1\b|application[\s_.-]*for[\s_.-]*(a[\s_.-]*)?building[\s_.-]*permit/i;
function splitUnneeded(list: File[]): { keep: File[]; skip: string[] } {
  return {
    keep: list.filter((f) => !UNNEEDED.test(f.name)),
    skip: list.filter((f) => UNNEEDED.test(f.name)).map((f) => f.name),
  };
}
