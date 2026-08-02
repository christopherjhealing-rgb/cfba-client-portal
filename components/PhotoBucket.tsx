"use client";
import { useRef, useState } from "react";
import { Icon } from "./Icon";

// Site photos at lodgement. The one place images are accepted — and no image
// ever uploads: each photo is resized in the browser (canvas, 1600 px longest
// edge, JPEG 0.8) and compiled into a single "Site photos.pdf", one photo per
// A4 page. That PDF joins the normal files state, so the PDF-only pipeline,
// validation, direct upload and Monday push are all untouched. jspdf loads on
// demand inside the handler to stay out of the main bundle.

const MAX_PHOTOS = 12;
const LONG_EDGE = 1600;
const JPEG_QUALITY = 0.8;
const PAGE_W = 210; // A4 portrait, mm
const PAGE_H = 297;
const MARGIN = 14;

export function PhotoBucket({
  files, onChange,
}: {
  files: File[];
  onChange: (files: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [compiling, setCompiling] = useState<number | null>(null);
  const [count, setCount] = useState(0);
  const [note, setNote] = useState<string | null>(null);

  async function compile(picked: File[]) {
    const photos = picked.filter(
      (f) => /^image\/(jpeg|png)$/.test(f.type) || /\.(jpe?g|png)$/i.test(f.name)
    );
    if (!photos.length) {
      setNote("JPEG or PNG photos only — PDFs go in the buckets above.");
      return;
    }
    const use = photos.slice(0, MAX_PHOTOS);
    setCompiling(use.length);
    setNote(photos.length > MAX_PHOTOS
      ? `That's more than ${MAX_PHOTOS} photos — we've taken the first ${MAX_PHOTOS}.`
      : null);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      for (let i = 0; i < use.length; i++) {
        const img = await toJpeg(use[i]);
        if (i > 0) doc.addPage();
        const scale = Math.min((PAGE_W - MARGIN * 2) / img.w, (PAGE_H - MARGIN * 2) / img.h);
        const w = img.w * scale, h = img.h * scale;
        doc.addImage(img.dataUrl, "JPEG", (PAGE_W - w) / 2, (PAGE_H - h) / 2, w, h);
      }
      const pdf = new File([doc.output("blob")], "Site photos.pdf", { type: "application/pdf" });
      onChange([pdf]); // a fresh pick always replaces the last compile
      setCount(use.length);
    } catch {
      setNote("We couldn't bundle those photos — you can still lodge the job and email them to admin@cfba.com.au.");
      onChange([]);
      setCount(0);
    }
    setCompiling(null);
    if (input.current) input.current.value = "";
  }

  const pdf = files[0];

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault(); setOver(false);
        const dropped = Array.from(e.dataTransfer?.files || []);
        if (dropped.length) compile(dropped);
      }}
      className={`rounded-lg border px-4 py-3.5 transition ${
      over ? "border-seal bg-[#EDF3EE] outline-dashed outline-2 outline-seal/40"
        : pdf ? "border-seal/35 bg-[#F4F8F4]" : "border-rule bg-white"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-[13px] font-semibold text-ink">
            Site photos (optional)
          </p>
          <p className="mt-0.5 text-[12px] leading-snug text-ink/55">
            JPEG or PNG photos straight from your phone — we&apos;ll bundle them
            into one PDF for the surveyor. Up to {MAX_PHOTOS}, or drag them onto
            this box.
          </p>
        </div>
        <button type="button" onClick={() => input.current?.click()}
          disabled={compiling !== null} className="btn-ghost shrink-0">
          {compiling !== null ? `Compiling ${compiling} photo${compiling === 1 ? "" : "s"}…`
            : pdf ? "Change photos" : "Choose photos"}
        </button>
      </div>

      <input ref={input} type="file" multiple accept="image/jpeg,image/png"
        className="hidden"
        onChange={(e) => compile(Array.from(e.target.files || []))} />

      {pdf && (
        <ul className="mt-3 space-y-1 border-t border-rule/70 pt-2.5">
          <li className="flex items-center gap-2 text-[13px] text-ink/70">
            <span className="text-seal"><Icon name="check" size={13} /></span>
            <span className="min-w-0 flex-1 truncate">
              {pdf.name}{count ? ` — ${count} photo${count === 1 ? "" : "s"}` : ""}
            </span>
            <span className="shrink-0 font-mono text-[11px] text-ink/40">
              {(pdf.size / 1048576).toFixed(1)} MB
            </span>
          </li>
        </ul>
      )}

      {note && <p className="mt-2 text-[12px] text-ink/60">{note}</p>}
    </div>
  );
}

/** Downscale one photo to LONG_EDGE and re-encode as JPEG for the PDF. */
async function toJpeg(f: File): Promise<{ dataUrl: string; w: number; h: number }> {
  const img = await decode(f);
  const iw = img instanceof HTMLImageElement ? img.naturalWidth : img.width;
  const ih = img instanceof HTMLImageElement ? img.naturalHeight : img.height;
  const scale = Math.min(1, LONG_EDGE / Math.max(iw, ih));
  const w = Math.max(1, Math.round(iw * scale));
  const h = Math.max(1, Math.round(ih * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  // White underlay so a transparent PNG doesn't turn black as JPEG.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  if (img instanceof ImageBitmap) img.close();
  return { dataUrl: canvas.toDataURL("image/jpeg", JPEG_QUALITY), w, h };
}

/** createImageBitmap honours the phone's EXIF rotation; older browsers fall
 *  back to an <img> decode. */
async function decode(f: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(f, { imageOrientation: "from-image" });
  } catch {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const url = URL.createObjectURL(f);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("could not read " + f.name)); };
      img.src = url;
    });
  }
}
