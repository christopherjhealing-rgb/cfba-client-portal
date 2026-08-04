import { redirect } from "next/navigation";
import { getClientSession } from "@/lib/session";
import * as repo from "@/lib/repo";
import { SignInNew } from "@/components/SignInNew";
import { SignInClassic } from "@/components/SignInClassic";

export const dynamic = "force-dynamic";

/** Sign-in. The layout is a staff choice (Admin → Sign-in design): "new" is
 *  the premium photo treatment, "classic" the original split panel. Read
 *  server-side on every request so flipping the setting takes effect on the
 *  next load — no deploy. Unset means "new". Both layouts wrap the same
 *  <SignIn/> component, so the auth flows are identical either way. */
export default async function Home({
  searchParams,
}: { searchParams: Promise<{ first?: string; u?: string }> }) {
  const session = await getClientSession();
  if (session) redirect("/dashboard");

  const setting = await repo
    .getSetting<{ design?: string }>("login_design")
    .catch(() => null);
  const design = setting?.design === "classic" ? "classic" : "new";

  // ?first=1&u=… is what the credentials email links to. That email hands a
  // client a username and a one-time setup code, so landing them on Sign In —
  // where neither of those works — was a phone call waiting to happen.
  //
  // The username is not a secret: it is printed in the same email, in larger
  // type. The setup code is never put in a link, because a URL travels through
  // browser history, referrers and forwarded messages in a way an email body
  // does not.
  const sp = await searchParams;
  const entry = {
    start: sp.first ? ("setup" as const) : ("signin" as const),
    presetUsername: (sp.u || "").trim().slice(0, 60),
  };

  return design === "classic" ? <SignInClassic {...entry} /> : <SignInNew {...entry} />;
}
