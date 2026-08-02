/** Shown in place of a section a staff member has switched off from /admin —
 *  a bookmaked link should explain itself, not 404. */
export function PageOffline({ section }: { section: string }) {
  return (
    <div className="card p-8 text-center">
      <h2 className="font-display text-[21px] font-semibold">Temporarily Unavailable</h2>
      <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-ink/65">
        {section} is offline for a short while as we make updates. The rest of
        the portal is unaffected — check back soon, or contact the office if
        it&apos;s urgent.
      </p>
    </div>
  );
}
