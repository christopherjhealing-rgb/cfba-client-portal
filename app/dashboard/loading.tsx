/** Branded shimmer while the dashboard's force-dynamic data loads. Shapes
 *  mirror the real page — sidebar, hero band, stat tiles, job rows — so
 *  nothing jumps when content lands. animate-pulse rides the existing motion
 *  layer: the global prefers-reduced-motion rule switches it off entirely. */
export default function DashboardLoading() {
  return (
    <div className="min-h-screen lg:flex" aria-busy="true" aria-label="Loading your dashboard">
      {/* Mobile bar + sidebar placeholders, same widths as the real shell. */}
      <div className="flex items-center gap-3 border-b border-rule bg-seal-deep px-4 py-3 lg:hidden">
        <div className="h-9 w-9 rounded-md bg-white/10" />
        <div className="h-8 w-8 rounded bg-white/10" />
        <div className="h-3 w-28 rounded bg-white/15" />
      </div>
      <aside className="hidden w-[248px] shrink-0 bg-seal-deep lg:block" />

      <div className="min-w-0 flex-1">
        <main className="mx-auto max-w-[1100px] px-5 py-7 lg:px-9 lg:py-9">
          {/* Hero band */}
          <div className="relative -mx-5 -mt-7 mb-7 overflow-hidden bg-seal-deep px-5 pb-6 pt-6 md:pb-8 md:pt-9 lg:-mx-9 lg:-mt-9 lg:px-9 lg:pt-11">
            <div className="animate-pulse">
              <div className="h-4 w-32 rounded bg-white/20" />
              <div className="mt-2 h-8 w-64 max-w-full rounded bg-white/25" />
              <div className="mt-3 h-4 w-80 max-w-full rounded bg-white/15" />
            </div>
          </div>

          {/* Stat tiles */}
          <div className="mb-8 grid animate-pulse gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="stat flex-col">
                <div className="h-10 w-10 rounded-lg bg-wash" />
                <div className="mt-3 h-7 w-10 rounded bg-wash" />
                <div className="mt-2 h-4 w-28 rounded bg-wash" />
                <div className="mt-1.5 h-3 w-36 max-w-full rounded bg-wash" />
              </div>
            ))}
          </div>

          {/* Job rows */}
          <div className="mb-2.5 flex animate-pulse items-center gap-3">
            <div className="h-3 w-36 rounded bg-rule/70" />
            <span className="h-px flex-1 bg-rule" />
          </div>
          <div className="card animate-pulse divide-y divide-rule overflow-hidden">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-4">
                <div className="flex w-[86px] shrink-0 justify-center">
                  <div className="h-[60px] w-[60px] rounded-full bg-wash" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="h-4 w-3/5 rounded bg-wash" />
                  <div className="mt-2 h-3 w-2/5 rounded bg-wash" />
                  <div className="mt-2.5 h-5 w-40 max-w-full rounded bg-wash" />
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
