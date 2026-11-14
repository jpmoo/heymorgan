// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 Jeff Moore
// Another device's turn, watched from the trial client (tests/remote.sh): the
// conversation reaches it, but not as being busy — no state of its own leaves
// idle. Its own turn still does. Run inside remote.sh:
//
//   tests/remote.sh node tests/mirror.mjs

import { execFileSync } from "node:child_process";
import { connect } from "node:net";
import { join } from "node:path";
import { WebSocket } from "ws";

const root = new URL("..", import.meta.url).pathname;
const env = { ...process.env, HEYMORGAN_ROLE: "server", HEYMORGAN_DATA: process.env.TRIAL_DATA };
delete env.HEYMORGAN_SOCKET;
const key = execFileSync(join(root, "bin/heymorgan"), ["access", "add", "kitchen"], { env, encoding: "utf8" }).match(/hc_[\w-]+/)[0];

let failures = 0;
const check = (what, ok, seen) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}${ok ? "" : `: ${JSON.stringify(seen)}`}`); if (!ok) failures++; };
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The trial client starts again once, to take up the trial brain's settings: let it settle.
await pause(5000);

// The trial client's own watchers: what a screen on that device would see.
const seen = [];
const watch = connect(process.env.HEYMORGAN_SOCKET);
watch.setEncoding("utf8");
let buffer = "";
watch.on("data", (chunk) => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf("\n")) >= 0) { const line = buffer.slice(0, nl); buffer = buffer.slice(nl + 1); try { seen.push(JSON.parse(line)); } catch { /* */ } }
});
watch.write("watch\n");

// Another device, typing a turn.
const link = new WebSocket(`ws://127.0.0.1:${process.env.TRIAL_PORT}`);
await new Promise((resolve) => {
  link.on("open", () => link.send(JSON.stringify({ hello: { key, device: "kitchen", kind: "trial", can: [] } })));
  link.on("message", (data) => { if (JSON.parse(String(data)).welcome) resolve(); });
});
await pause(500);
seen.length = 0;
link.send(JSON.stringify({ id: 1, command: "type Reply with only the word hello." }));
for (let i = 0; i < 120 && !seen.some((e) => e.type === "assistant"); i++) await pause(500);
await pause(1500);
check("another device's turn reaches this one as the conversation", seen.some((e) => e.type === "user") && seen.some((e) => e.type === "assistant"), seen.map((e) => e.type));
const busy = seen.filter((e) => e.type === "state" && e.state !== "idle");
check("but this device is never busy with it", busy.length === 0, busy);

// This device's own turn: followed as before.
seen.length = 0;
const own = connect(process.env.HEYMORGAN_SOCKET);
own.end("type Reply with only the word again.\n");
for (let i = 0; i < 120 && !seen.some((e) => e.type === "state" && e.state === "idle" && seen.some((x) => x.type === "assistant")); i++) await pause(500);
check("its own turn is followed: busy, then idle", seen.some((e) => e.type === "state" && e.state !== "idle") && seen.at(-1)?.state === "idle" || seen.some((e) => e.type === "state" && e.state === "idle"), seen.filter((e) => e.type === "state"));

link.close();
watch.destroy();
process.exit(failures ? 1 : 0);
