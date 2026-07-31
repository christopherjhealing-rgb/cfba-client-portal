import { NextResponse } from "next/server";
import { getClientSession, isStaff } from "@/lib/session";
import { env } from "@/lib/env";
import { decryptChecker } from "@/lib/checker.mjs";
import payload from "@/lib/checker-payload.json";

export const dynamic = "force-dynamic";

// The checker is a self-contained HTML app, committed encrypted (the same
// AES-GCM payload the public GitHub Pages copy serves). It is decrypted here,
// server-side, so a signed-in client never sees a second password prompt and
// the password never reaches the browser. Decrypting costs a 250k-iteration
// PBKDF2, so the result is kept for the life of the instance.
let cached: string | null = null;

function notice(text: string, status: number) {
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><body style="margin:0;display:grid;place-items:center;min-height:100vh;font-family:system-ui;background:#F5F7F3;color:#101A15"><p style="max-width:36ch;text-align:center;font-size:14px;line-height:1.6;opacity:.7">${text}</p>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export async function GET() {
  const session = await getClientSession();
  if (!session && !(await isStaff())) {
    return notice("Sign in to the portal to use the checker.", 401);
  }
  if (!env.checkerPassword) {
    return notice("The checker isn't switched on in this environment.", 503);
  }
  if (!cached) {
    try {
      cached = decryptChecker(payload, env.checkerPassword);
    } catch (e) {
      console.error("Checker decrypt failed — check CHECKER_PASSWORD", e);
      return notice("The checker is temporarily unavailable.", 503);
    }
  }
  return new NextResponse(cached, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "frame-ancestors 'self'",
      "X-Frame-Options": "SAMEORIGIN",
      "X-Robots-Tag": "noindex",
    },
  });
}
