/** Branded shimmer while My jobs' force-dynamic data loads. Mirrors the real
 *  page — sidebar, photo-band head, filter chips, table rows — so nothing
 *  jumps when content lands. animate-pulse is switched off globally for
 *  prefers-reduced-motion users. */
export default function JobsLoading() {
  return (
    <div className="min-h-screen lg:flex" aria-busy="true" aria-label="Loading your jobs">
      <div className="flex items-center gap-3 border-b border-rule bg-seal-deep px-4 py-3 lg:hidden">
        <div className="h-9 w-9 rounded-md bg-white/10" />
        <div className="h-8 w-8 rounded bg-white/10" />
        <div className="h-3 w-28 rounded bg-white/15" />
      </div>
      <aside className="hidden w-[248px] shrink-0 bg-seal-deep lg:block" />

      <div className="min-w-0 flex-1">
        <main className="mx-auto max-w-[1100px] px-5 py-7 lg:px-9 lg:py-9">
          {/* Page head band */}
          <div className="relative -mx-5 -mt-7 mb-7 overflow-hidden bg-seal-deep px-5 pb-5 pt-7 md:pb-7 md:pt-10 lg:-mx-9 lg:-mt-9 lg:px-9 lg:pt-12">
            <div className="animate-pulse">
              <div className="h-7 w-40 rounded bg-white/25" />
              <div className="mt-2.5 h-4 w-72 max-w-full rounded bg-white/15" />
            </div>
          </div>

          {/* Search + filter chips */}
          <div className="mb-4 animate-pulse">
            <div className="h-9 w-full max-w-md rounded-md bg-white" />
          </div>
          <div className="mb-5 flex animate-pulse flex-wrap gap-1.5">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-8 w-24 rounded-md border border-rule bg-white" />
            ))}
          </div>

          {/* Table */}
          <div className="card animate-pulse overflow-hidden">
            <div className="border-b border-rule bg-wash px-4 py-3">
              <div className="h-3 w-56 max-w-full rounded bg-rule/70" />
            </div>
            <div className="divide-y divide-rule">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-4">
                  <div className="h-3.5 w-[72px] shrink-0 rounded bg-wash" />
                  <div className="min-w-0 flex-1">
                    <div className="h-4 w-1/2 rounded bg-wash" />
                    <div className="mt-2 h-3 w-1/3 rounded bg-wash" />
                  </div>
                  <div className="hidden h-6 w-36 shrink-0 rounded-md bg-wash sm:block" />
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
