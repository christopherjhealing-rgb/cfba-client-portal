import { NextResponse } from "next/server";
import { isStaff } from "@/lib/session";
import * as repo from "@/lib/repo";
import { refreshPastJobs } from "@/lib/history";
import {
  issueAmendment, getAmendmentConfig, setAmendmentConfig, lodgeAmendment,
  AMENDMENT_OPEN, type AmendmentConfig,
} from "@/lib/amendments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Reads the revised documents back out of storage to email them.
export const maxDuration = 120;

export async function POST(req: Request) {
  if (!(await isStaff())) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));

    // --- rebuild the past-jobs index ---------------------------------------
    if (body.rebuildHistory === true) {
      const r = await refreshPastJobs();
      await repo.setSetting("last_history", { at: new Date().toISOString(), ok: true, ...r })
        .catch(() => {});
      return NextResponse.json({ ok: true, ...r });
    }

    // --- routing config ----------------------------------------------------
    if (body.config) {
      const next: AmendmentConfig = {
        routes: Array.isArray(body.config.routes) ? body.config.routes : [],
        fallbackName: String(body.config.fallbackName || ""),
      };
      await setAmendmentConfig(next);
      return NextResponse.json({ ok: true, config: await getAmendmentConfig() });
    }

    const id = String(body.id || "");
    const sub = await repo.getSubmission(id);
    if (!sub || !sub.amendmentOf) {
      return NextResponse.json({ error: "No such amendment." }, { status: 404 });
    }

    // --- send it again -----------------------------------------------------
    // For the day the email didn't go, or went to the wrong person because
    // Certified By was blank at the time and has since been filled in.
    if (body.resend === true) {
      // Not once it's been sent back. lodgeAmendment re-posts "AMENDMENT
      // lodged" to the card and re-emails the surveyor, so resending a
      // finished one asks somebody to approve work that's already gone out.
      if (sub.status !== AMENDMENT_OPEN) {
        return NextResponse.json(
          { error: "That amendment is already finished — nothing left to send." },
          { status: 409 }
        );
      }
      const r = await lodgeAmendment(id);
      return r.emailed
        ? NextResponse.json({ ok: true, sent: true, to: r.to, why: r.why })
        : NextResponse.json(
            { error: r.to ? "It still didn't send." : `Nowhere to send it — ${r.why}` },
            { status: 502 }
          );
    }

    // --- the revised certificate going back --------------------------------
    if (body.issue === true) {
      if (sub.status !== AMENDMENT_OPEN) {
        return NextResponse.json(
          { error: "That amendment has already been sent back." }, { status: 409 }
        );
      }
      const draftId = String(body.draftId || "");
      const names: string[] = Array.isArray(body.names) ? body.names.map(String) : [];
      if (!/^up_[0-9a-f-]{20,}$/i.test(draftId) || !names.length) {
        return NextResponse.json({ error: "Nothing was uploaded." }, { status: 400 });
      }

      // Sizes come from storage, never from the browser's claims.
      const landed = new Map(
        (await repo.listFiles(`uploads/staff/${draftId}`)).map((f) => [f.name, f.size])
      );
      const missing = names.filter((n) => !landed.has(n));
      if (missing.length) {
        return NextResponse.json(
          { error: `Those files didn't finish uploading: ${missing.slice(0, 3).join(", ")}` },
          { status: 400 }
        );
      }

      // Into the amendment's own folder, so it sits with the documents the
      // client lodged rather than in a staff scratch area that gets cleared.
      const files: { name: string; size: number }[] = [];
      for (const name of names) {
        const bytes = await repo.readFile(`uploads/staff/${draftId}/${name}`);
        await repo.writeFile(`amendments/${id}/${name}`, bytes, "application/pdf");
        await repo.deleteFile(`uploads/staff/${draftId}/${name}`).catch(() => {});
        files.push({ name, size: landed.get(name) || bytes.length });
      }

      const r = await issueAmendment(id, files);
      if (!r.ok) return NextResponse.json({ error: r.why || "That didn't work." }, { status: 400 });
      return NextResponse.json({ ok: true, emailed: r.emailed, files: files.length });
    }

    return NextResponse.json({ error: "Nothing to do." }, { status: 400 });
  } catch (e) {
    console.error("amendment action failed:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
