import { DEMO_MODE } from "./env";
import * as demo from "./demo";
import { sb } from "./repo";

export const FREE_ATTEMPTS = 3;

// Progressive backoff rather than a flat lockout. Three free attempts covers a
// mistyped password; after that the wait grows fast enough that working through
// a password list is hopeless, while a genuine fat-finger clears in five
// minutes. A flat 15 minutes punished the honest case as hard as the attack.
function lockMinutes(failures: number): number {
  if (failures < FREE_ATTEMPTS) return 0;
  if (failures < 6) return 5;
  if (failures < 9) return 30;
  return 120;
}

/** Failed sign-in attempts, counted per username. Three strikes then a
 *  cooldown. Counted server-side rather than per-browser, because the point is
 *  to stop someone working through a password list from anywhere. */
export async function checkLock(username: string): Promise<number> {
  const rec = await read(username);
  if (!rec) return 0;
  const mins = lockMinutes(rec.count);
  if (!mins) return 0;
  const until = new Date(rec.last).getTime() + mins * 60_000;
  const left = Math.ceil((until - Date.now()) / 60_000);
  return left > 0 ? left : 0;
}

/** Staff override, so the office can put someone back in immediately. */
export async function unlock(username: string): Promise<void> {
  await clearFailures(username);
}

export async function recordFailure(username: string): Promise<void> {
  const rec = await read(username);
  // The counter only resets after a clear day, so an attacker can't wait out
  // the short lockout and start again from three free attempts.
  const stale = rec && Date.now() - new Date(rec.last).getTime() > 24 * 60 * 60_000;
  await write(username, {
    count: !rec || stale ? 1 : rec.count + 1,
    last: new Date().toISOString(),
  });
}

export async function clearFailures(username: string): Promise<void> {
  await write(username, null);
}

interface Rec { count: number; last: string }

async function read(username: string): Promise<Rec | null> {
  const key = username.toLowerCase();
  if (DEMO_MODE) {
    const db = await demo.load();
    return (db.attempts || {})[key] || null;
  }
  const { data } = await sb().from("login_attempts")
    .select("count, last_at").eq("username", key).maybeSingle();
  return data ? { count: Number(data.count), last: String(data.last_at) } : null;
}

async function write(username: string, rec: Rec | null): Promise<void> {
  const key = username.toLowerCase();
  if (DEMO_MODE) {
    const db = await demo.load();
    db.attempts ||= {};
    if (rec) db.attempts[key] = rec; else delete db.attempts[key];
    await demo.save(db);
    return;
  }
  if (!rec) {
    await sb().from("login_attempts").delete().eq("username", key);
    return;
  }
  await sb().from("login_attempts")
    .upsert({ username: key, count: rec.count, last_at: rec.last }, { onConflict: "username" });
}
