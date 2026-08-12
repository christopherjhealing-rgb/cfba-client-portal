// The e2e runner behind `npm run test:e2e`.
//
// Boots the production build in demo mode on its own port with a PRIVATE
// TMPDIR, so the seeded demo store is the fixture: fresh every run, never
// the developer's own demo state, and readable by the specs for store-level
// assertions. Auto-accept is OFF for the run so the review queue can be
// exercised (the same posture as a Monday outage). Kills the exact child it
// spawned — never a pkill.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PORT = Number(process.env.E2E_PORT || 3100);
const BASE = `http://localhost:${PORT}`;
const TMP = path.join(os.tmpdir(), "cfba-e2e");
const STORE = path.join(TMP, "cfba-portal-demo.json");
const nextBin = path.join(ROOT, "node_modules", ".bin", "next");

// A build must exist — make one if it doesn't (first run on a fresh clone).
if (!fs.existsSync(path.join(ROOT, ".next", "BUILD_ID"))) {
  console.log("e2e: no production build found — running `next build` once…");
  const b = spawnSync(nextBin, ["build"], { cwd: ROOT, stdio: "inherit" });
  if (b.status !== 0) process.exit(b.status ?? 1);
}

fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

const server = spawn(nextBin, ["start", "-p", String(PORT)], {
  cwd: ROOT,
  env: {
    ...process.env,
    TMPDIR: TMP, TMP, TEMP: TMP, // demo store lives in os.tmpdir()
    AUTO_ACCEPT_LODGEMENTS: "0",
    // Demo mode must hold whatever the developer's shell carries.
    SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => { serverLog += d; });
server.stderr.on("data", (d) => { serverLog += d; });

const ready = async () => {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/`);
      if (r.ok) return true;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
};

const shutdown = (code) => {
  server.kill("SIGTERM");
  setTimeout(() => { server.kill("SIGKILL"); process.exit(code); }, 2000).unref();
  process.exitCode = code;
};

if (!(await ready())) {
  console.error("e2e: server never came up on", BASE, "\n--- server log ---\n", serverLog.slice(-4000));
  shutdown(1);
} else {
  const dir = path.join(ROOT, "tests", "e2e");
  const specs = fs.readdirSync(dir).filter((f) => /^\d.*\.e2e\.mjs$/.test(f)).sort()
    .map((f) => path.join(dir, f));
  console.log(`e2e: ${specs.length} specs against ${BASE} (store: ${STORE})`);

  const runner = spawn(process.execPath, ["--test", "--test-concurrency=1", ...specs], {
    cwd: ROOT,
    env: { ...process.env, E2E_BASE: BASE, E2E_STORE: STORE },
    stdio: "inherit",
  });
  runner.on("exit", (code) => {
    if (code !== 0) console.error("\ne2e: FAILED — last server output:\n" + serverLog.slice(-2000));
    shutdown(code ?? 1);
  });
}
