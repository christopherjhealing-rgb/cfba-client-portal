import * as repo from "./repo";

/** Threads with a CFBA message newer than the last time this company opened
 *  them. Drives the sidebar badge. */
export async function unreadCount(companyId: string): Promise<number> {
  const [msgs, reads] = await Promise.all([
    repo.listMessagesForCompany(companyId),
    repo.getReadMarks(companyId),
  ]);
  const byRef = new Map<string, string>();
  for (const m of msgs) {
    if (m.from !== "cfba") continue;
    const cur = byRef.get(m.ref);
    if (!cur || m.createdAt > cur) byRef.set(m.ref, m.createdAt);
  }
  let n = 0;
  for (const [ref, latest] of byRef) {
    if (!reads[ref] || reads[ref] < latest) n++;
  }
  return n;
}
