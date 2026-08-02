import { DEMO_MODE } from "@/lib/env";
import { SignIn } from "@/components/SignIn";
import { Icon } from "@/components/Icon";

const POINTS = [
  { icon: "folder", text: "Track Your Jobs" },
  { icon: "download", text: "Download Your CDC Package" },
  { icon: "check", text: "Secure, Simple, Reliable" },
] as const;

/** The original split-panel sign-in. Kept as the "classic" layout behind the
 *  login_design setting so staff can switch back instantly from /admin —
 *  no deploy, no code change. */
export function SignInClassic() {
  return (
    <main className="min-h-screen lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      {/* Hero. The photograph is decorative and sits behind a scrim so the type
          holds contrast whatever image is dropped in at /public/hero.jpg. */}
      <section className="relative isolate flex min-h-[300px] flex-col justify-between overflow-hidden bg-seal-deep px-8 py-10 lg:min-h-screen lg:px-12 lg:py-14">
        <div aria-hidden="true" className="hero-photo absolute inset-0 -z-10 saturate-[0.55]"
          style={{ "--hero": "url(/hero.jpg)", "--hero-m": "url(/hero-m.jpg)" } as React.CSSProperties} />
        <div aria-hidden="true"
          // A near-neutral scrim rather than a green one: the photograph keeps its own
        // colour and the type still holds contrast.
        className="absolute inset-0 -z-10 bg-gradient-to-br from-[#1C2622]/88 via-[#1C2622]/68 to-[#0D1310]/90" />

        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-white.png" alt="CF Building Approvals"
            className="h-16 w-16 object-contain lg:h-20 lg:w-20" />
          <div className="mt-5 font-display text-[15px] font-semibold tracking-[0.14em] text-white/85">
            CF BUILDING APPROVALS
          </div>
          <div className="mt-1.5 font-display text-[22px] font-medium tracking-[0.3em] text-white lg:text-[26px]">
            CLIENT PORTAL
          </div>
        </div>

        <div className="mt-10">
          <h1 className="max-w-md font-display text-[26px] font-semibold leading-tight text-white lg:text-[30px]">
            Your applications, all in one place.
          </h1>
          <ul className="mt-7 space-y-3.5">
            {POINTS.map((p) => (
              <li key={p.text} className="flex items-center gap-3.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-white/25 bg-white/10 text-white">
                  <Icon name={p.icon} size={16} />
                </span>
                <span className="text-[15px] text-white/85">{p.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="flex items-center justify-center px-6 py-12 lg:px-12">
        <div className="w-full max-w-[420px]">
          <div className="mb-6">
            <h2 className="font-display text-[26px] font-semibold text-ink">Welcome Back</h2>
            <p className="mt-1 text-[14px] text-ink/60">Sign in to your account</p>
          </div>

          <SignIn demo={DEMO_MODE} />

          <p className="mt-5 text-center text-[13px] text-ink/55">
            Need a new account?{" "}
            <a className="font-medium text-seal underline underline-offset-2"
              href="mailto:admin@cfba.com.au">Contact the CFBA office</a>
          </p>
          <p className="mt-8 text-center text-[11px] text-ink/35">
            CF Building Approvals · Perth, Western Australia
          </p>
        </div>
      </section>
    </main>
  );
}
