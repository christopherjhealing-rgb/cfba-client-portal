import { NextResponse } from "next/server";
import { isStaff } from "@/lib/session";
import * as repo from "@/lib/repo";
import { getFirEdits, setFirEdits, isShipped } from "@/lib/fir-library";
import { normalise, type FirItem } from "@/lib/fir.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Edit the FIR library.
 *
 * The wording is what clients read over our name, so this is staff-only and
 * every change is logged. A shipped item can be reworded or switched off but
 * never deleted — the text stays in the build, so "put it back" is one click
 * rather than an archaeology exercise.
 */
export async function POST(req: Request) {
  if (!(await isStaff())) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const current = await getFirEdits();
    const edits = { ...(current.edits || {}) };
    const extra = [...(current.extra || [])];
    const disabled = new Set(current.disabled || []);

    // --- reword a shipped item, or revert it -------------------------------
    if (body.action === "edit") {
      const code = String(body.code || "");
      if (!isShipped(code)) {
        return NextResponse.json({ error: "No such shortcut." }, { status: 404 });
      }
      if (body.revert === true) {
        delete edits[code];
      } else {
        const title = String(body.title || "").trim();
        const text = String(body.body || "").trim();
        if (!title || text.length < 20) {
          return NextResponse.json(
            { error: "A shortcut needs a name and a request long enough to read as one." },
            { status: 400 }
          );
        }
        edits[code] = { title, body: text };
      }
      await setFirEdits({ edits, extra, disabled: [...disabled] });
      await repo.logAudit("fir.edit", code, body.revert ? "reverted" : "reworded");
      return NextResponse.json({ ok: true });
    }

    // --- one of ours -------------------------------------------------------
    if (body.action === "add") {
      const item: FirItem = {
        code: String(body.code || "").trim().toLowerCase(),
        title: String(body.title || "").trim(),
        body: String(body.body || "").trim(),
        group: "Ours",
        aliases: Array.isArray(body.aliases)
          ? body.aliases.map(String).map((a: string) => a.trim()).filter(Boolean)
          : [],
      };
      if (!item.code || !item.title || item.body.length < 20) {
        return NextResponse.json(
          { error: "Needs a shortcut, a name, and a request long enough to read as one." },
          { status: 400 }
        );
      }
      if (item.code.length > 14) {
        return NextResponse.json(
          { error: "Keep the shortcut short — it has to be typed from memory." },
          { status: 400 }
        );
      }
      // A shortcut that already means something else would shadow it, and
      // which one won would depend on declaration order.
      const taken = isShipped(item.code)
        || extra.some((e) => normalise(e.code) === normalise(item.code));
      if (taken) {
        return NextResponse.json(
          { error: `"${item.code}" is already a shortcut.` }, { status: 409 }
        );
      }
      extra.push(item);
      await setFirEdits({ edits, extra, disabled: [...disabled] });
      await repo.logAudit("fir.add", item.code, item.title);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "remove") {
      const code = String(body.code || "");
      const at = extra.findIndex((e) => normalise(e.code) === normalise(code));
      if (at < 0) return NextResponse.json({ error: "No such shortcut." }, { status: 404 });
      extra.splice(at, 1);
      await setFirEdits({ edits, extra, disabled: [...disabled] });
      await repo.logAudit("fir.remove", code);
      return NextResponse.json({ ok: true });
    }

    // --- switch a shipped one off, or back on ------------------------------
    if (body.action === "toggle") {
      const code = String(body.code || "");
      if (!isShipped(code)) {
        return NextResponse.json({ error: "No such shortcut." }, { status: 404 });
      }
      if (disabled.has(code)) disabled.delete(code);
      else disabled.add(code);
      await setFirEdits({ edits, extra, disabled: [...disabled] });
      await repo.logAudit("fir.toggle", code, disabled.has(code) ? "off" : "on");
      return NextResponse.json({ ok: true, disabled: disabled.has(code) });
    }

    return NextResponse.json({ error: "Nothing to do." }, { status: 400 });
  } catch (e) {
    console.error("fir library edit failed:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
