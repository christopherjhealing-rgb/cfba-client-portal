// Browser-side upload helper. Vercel caps function request bodies at ~4.5 MB,
// so files can't travel through /api/submit or /api/messages directly. Instead
// the server signs short-lived upload URLs into the private bucket and the
// browser PUTs each file straight to storage; only tiny metadata then goes to
// the API, which verifies everything against what actually landed.
//
// In demo mode (no Supabase) the server answers { mode: "inline" } and callers
// fall back to the original multipart POST, which demo storage handles fine.

export type DirectUpload =
  | { mode: "inline" }
  | { mode: "direct"; draftId: string; names: string[] }
  | { error: string };

export async function uploadDirect(
  purpose: "submission" | "message" | "infosheet",
  files: File[],
  onProgress?: (done: number, total: number) => void
): Promise<DirectUpload> {
  const r = await fetch("/api/uploads/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      purpose,
      files: files.map((f) => ({ name: f.name, size: f.size })),
    }),
  }).catch(() => null);
  const d = await r?.json().catch(() => ({}));
  if (!r || !r.ok) {
    return { error: d?.error || "We couldn't start the upload — please try again." };
  }
  if (d.mode === "inline") return { mode: "inline" };

  const signed: { name: string; url: string }[] = d.files || [];
  for (let i = 0; i < files.length; i++) {
    onProgress?.(i, files.length);
    const put = await fetch(signed[i].url, {
      method: "PUT",
      headers: { "Content-Type": files[i].type || "application/pdf" },
      body: files[i],
    }).catch(() => null);
    if (!put || !put.ok) {
      return {
        error: `Uploading ${files[i].name} didn't finish — check your connection and try again.`,
      };
    }
  }
  onProgress?.(files.length, files.length);
  return { mode: "direct", draftId: d.draftId, names: signed.map((s) => s.name) };
}
