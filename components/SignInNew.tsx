import { DEMO_MODE } from "@/lib/env";
import { SignIn } from "@/components/SignIn";

/** The premium sign-in: one full-bleed photograph under the same deep-green
 *  scrim the portal's page heads use, with the warm voice and the trust
 *  markers a first-time visitor should meet before they type anything.
 *  The form itself is the shared <SignIn/> — this file styles the room the
 *  form sits in, never the auth. Staff can switch back to the classic layout
 *  from /admin (login_design setting); no deploy needed. */
export function SignInNew() {
  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-seal-deep">
      {/* Full-bleed photo. Decorative — everything readable sits on the scrim.
          Phones fetch the 900px crop. */}
      <div aria-hidden="true" className="hero-photo absolute inset-0 -z-20 saturate-[0.75]"
        style={{ "--hero": "url(/heroes/entry.jpg)", "--hero-m": "url(/heroes/entry-m.jpg)" } as React.CSSProperties} />
      {/* The established page-head scrim, plus a soft floor so the trust line
          holds contrast where the photograph runs light. */}
      <div aria-hidden="true"
        className="absolute inset-0 -z-10 bg-gradient-to-r from-[#0D211A] via-[#0D211A]/65 to-[#0D211A]/10" />
      <div aria-hidden="true"
        className="absolute inset-0 -z-10 bg-gradient-to-t from-[#0D211A]/80 via-transparent to-[#0D211A]/35" />

      <div className="mx-auto flex min-h-screen w-full max-w-[1160px] flex-col px-6 py-8 lg:px-10 lg:py-10">
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-white.png" alt="CF Building Approvals"
            className="h-14 w-14 object-contain lg:h-16 lg:w-16" />
          <div>
            <div className="font-display text-[14px] font-bold leading-tight tracking-[0.1em] text-white">
              CF BUILDING APPROVALS
            </div>
            <div className="mt-1 font-display text-[10px] uppercase tracking-[0.26em] text-white/60">
              Client Portal
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col justify-center gap-10 py-10 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,430px)] lg:items-center lg:gap-16">
          <div>
            <h1 className="max-w-xl font-display text-[30px] font-semibold leading-tight text-white lg:text-[40px]">
              Good to see you.
            </h1>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/80 lg:text-[16px]">
              Every job you have with us, in one place — lodge new work, answer a
              request the moment it lands, and download your certificates the day
              they&apos;re issued.
            </p>
          </div>

          <div className="w-full max-w-[430px]">
            <SignIn demo={DEMO_MODE} />
            <p className="mt-5 text-center text-[13px] text-white/75">
              Need a new account?{" "}
              <a className="font-medium text-white underline underline-offset-2"
                href="mailto:admin@cfba.com.au">Contact the CFBA office</a>
            </p>
          </div>
        </div>

        {/* Trust markers — who we are and how to reach a person, before signing in. */}
        <div className="border-t border-white/15 pt-4">
          <ul className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[12.5px] text-white/75">
            <li>Registered building surveyors</li>
            <li aria-hidden="true" className="text-white/35">·</li>
            <li>Perth, Western Australia</li>
            <li aria-hidden="true" className="text-white/35">·</li>
            <li>
              <a className="underline-offset-2 hover:text-white hover:underline" href="tel:1300029074">
                1300 029 074
              </a>
            </li>
            <li aria-hidden="true" className="text-white/35">·</li>
            <li>
              <a className="underline-offset-2 hover:text-white hover:underline" href="mailto:admin@cfba.com.au">
                admin@cfba.com.au
              </a>
            </li>
          </ul>
        </div>
      </div>
    </main>
  );
}
