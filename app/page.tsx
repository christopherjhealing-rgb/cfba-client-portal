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
export default async function Home() {
  const session = await getClientSession();
  if (session) redirect("/dashboard");

  const setting = await repo
    .getSetting<{ design?: string }>("login_design")
    .catch(() => null);
  const design = setting?.design === "classic" ? "classic" : "new";

  return design === "classic" ? <SignInClassic /> : <SignInNew />;
}
