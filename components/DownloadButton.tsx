"use client";
import { useState } from "react";

export function DownloadButton({ href, label = "Download" }: { href: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <a
      href={href}
      className="btn"
      onClick={() => {
        setBusy(true);
        // The browser handles the file download; reload to move the job into
        // the Downloaded section once the server records it.
        setTimeout(() => window.location.reload(), 2200);
      }}
    >
      {busy ? "Preparing…" : label}
    </a>
  );
}
