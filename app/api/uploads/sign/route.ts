import { NextResponse } from "next/server";
import { getClientSession, isStaff } from "@/lib/session";
import { DEMO_MODE } from "@/lib/env";
import * as repo from "@/lib/repo";
import { disabledPages } from "@/lib/pages";
import { uniqueName } from "@/lib/uploads.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-purpose ceilings, mirrored from the submit and messages routes — those
// routes re-check against real stored sizes, so these are the fast first gate.
const LIMITS = {
  submission: { totalBytes: 40 * 1024 * 1024, maxFiles: 30, label: "40 MB" },
  message: { totalBytes: 25 * 1024 * 1024, maxFiles: 15, label: "25 MB" },
  infosheet: { totalBytes: 20 * 1024 * 1024, maxFiles: 1, label: "20 MB" },
  form: { totalBytes: 20 * 1024 * 1024, maxFiles: 1, label: "20 MB" },
} as const;

const sanitize = (name: string) => name.replace(/[^A-Za-z0-9 ._-]/g, "_").slice(0, 120);

export async function POST(req: Request) {
  try {
    const staff = await isStaff();
    const session = await getClientSession();

    const body = await req.json().catch(() => ({}));
    const purpose =
      body.purpose === "message" ? "message" :
      body.purpose === "submission" ? "submission" :
      body.purpose === "infosheet" ? "infosheet" :
      body.purpose === "form" ? "form" : null;
    if (!purpose) return NextResponse.json({ error: "Unknown upload purpose." }, { status: 400 });

    // Info-sheet and council-form uploads are staff actions; everything else
    // needs a real (non-impersonated) client session.
    const staffUpload = purpose === "infosheet" || purpose === "form";
    if (staffUpload) {
      if (!staff) return NextResponse.json({ error: "Your session has ended — sign in again and you can pick up where you left off." }, { status: 401 });
    } else {
      if (!session) return NextResponse.json({ error: "Your session has ended — sign in again and you can pick up where you left off." }, { status: 401 });
      if (session.impersonated) {
        return NextResponse.json(
          { error: "You're viewing this portal as staff — uploads are disabled." },
          { status: 403 }
        );
      }
    }
    const limits = LIMITS[purpose];

    // Respect the /admin page switches: messages gate message uploads;
    // submission uploads stay possible while either lodging or amending is on.
    // Staff uploads are never gated.
    if (!staffUpload) {
      const off = await disabledPages();
      if (purpose === "message" ? off.has("messages") : off.has("submit") && off.has("amend")) {
        return NextResponse.json(
          { error: "This section is temporarily offline while we make updates — please try again shortly." },
          { status: 503 }
        );
      }
    }

    const wanted: { name: string; size: number }[] = Array.isArray(body.files)
      ? body.files.map((f: { name?: unknown; size?: unknown }) => ({
          name: String(f?.name || ""), size: Number(f?.size || 0),
        }))
      : [];
    if (!wanted.length) return NextResponse.json({ error: "No files to upload." }, { status: 400 });
    if (wanted.length > limits.maxFiles) {
      return NextResponse.json({ error: `That's more than ${limits.maxFiles} files — send them in batches of ${limits.maxFiles} or fewer.` }, { status: 400 });
    }

    // PDFs everywhere except council forms. Councils publish those as Word as
    // often as PDF, and the Word original is the more useful one — a client can
    // fill it in rather than print, write and scan. Everything else stays
    // PDF-only on purpose: lodged drawings get opened by staff and shipped to
    // the board, and that whole path assumes a PDF.
    const allowed = purpose === "form" ? /\.(pdf|docx?)$/i : /\.pdf$/i;
    const wrongType = wanted.filter((f) => !allowed.test(f.name)).map((f) => f.name);
    if (wrongType.length) {
      return NextResponse.json(
        {
          error: purpose === "form"
            ? `Council forms can be PDF or Word — please convert or remove: ${wrongType.slice(0, 4).join(", ")}`
            : `We can only accept PDFs — please convert or remove: ${wrongType.slice(0, 4).join(", ")}`,
        },
        { status: 415 }
      );
    }
    if (wanted.some((f) => !(f.size > 0))) {
      return NextResponse.json({ error: "One of those files looks empty." }, { status: 400 });
    }
    const total = wanted.reduce((n, f) => n + f.size, 0);
    if (total > limits.totalBytes) {
      return NextResponse.json(
        { error: `Those files come to more than ${limits.label} all up — email the biggest ones to admin@cfba.com.au and we'll add them to the job for you.` },
        { status: 413 }
      );
    }

    // Local dev without Supabase: the old multipart path still works there,
    // and in-memory demo storage can't take a browser PUT anyway.
    if (DEMO_MODE) return NextResponse.json({ mode: "inline" });

    // The prefix embeds the session's own company id, so a client can only
    // ever write into — and later reference — their own draft area. Staff
    // info-sheet uploads get their own area instead.
    const draftId = "up_" + crypto.randomUUID();
    const prefix = staffUpload
      ? `uploads/staff/${draftId}`
      : `uploads/${session!.companyId}/${draftId}`;
    const used = new Set<string>();
    const files: { name: string; url: string }[] = [];
    for (const f of wanted) {
      const name = uniqueName(sanitize(f.name), used);
      files.push({ name, url: await repo.signUploadUrl(`${prefix}/${name}`) });
    }

    return NextResponse.json({ mode: "direct", draftId, files });
  } catch (e) {
    console.error("sign failed:", e);
    return NextResponse.json(
      { error: "We couldn't start the upload. Please try again." },
      { status: 500 }
    );
  }
}
