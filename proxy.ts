import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * The studio's own domain.
 *
 * When STUDIO_HOST is set (e.g. siteplan.cfba.com.au) and a request arrives on
 * that host, it is served the /studio pages at clean paths — the visitor sees
 * siteplan.cfba.com.au/designs, never /studio/designs. The portal's own domain
 * is untouched: every rule below starts with a host check, so with STUDIO_HOST
 * unset this file does nothing at all.
 *
 * /api/* is deliberately never rewritten — the studio pages call
 * /api/studio/... and /api/auth/login by absolute path, and those must reach
 * the real routes on either host.
 */
export function proxy(req: NextRequest) {
  const studioHost = (process.env.STUDIO_HOST || "").trim().toLowerCase();
  if (!studioHost) return NextResponse.next();

  const host = (req.headers.get("host") || "").toLowerCase().split(":")[0];
  if (host !== studioHost) return NextResponse.next();

  const { pathname } = req.nextUrl;

  // Keep URLs canonical on the studio domain: a link to /studio/... (the
  // pages link that way internally) comes straight back without the prefix.
  if (pathname === "/studio" || pathname.startsWith("/studio/")) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.slice("/studio".length) || "/";
    return NextResponse.redirect(url, 308);
  }

  // Everything else on this host IS the studio.
  const url = req.nextUrl.clone();
  url.pathname = `/studio${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // Never touch API routes, Next internals, or real files (images, pdfs —
  // anything with an extension); they exist at their true paths on any host.
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
