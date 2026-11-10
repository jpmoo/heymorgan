#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 Jeff Moore
// `embed` (protocol 1.14): texts made into embeddings by the model server the
// brain uses, for a client keeping its own index. On a Morgan of its own — its
// own folder and socket, never a client of the real server — with a stand-in
// model server that says what it was asked.
//
//   node tests/embed.mjs [socket-to-leave-running-for]
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const trial = mkdtempSync(join(tmpdir(), "morgan-embed-"));
const socket = join(trial, "morgan.sock");
let failed = 0;
const check = (name, ok, more = "") => { if (!ok) failed++; console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && more ? `: ${more}` : ""}`); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---- the stand-in model server: an embedding of each text is its length and its first letter's code; "missing" is not pulled
const asked = [];
const ollama = createServer((request, response) => {
  let body = "";
  request.on("data", (chunk) => { body += chunk; });
  request.on("end", () => {
    response.setHeader("Content-Type", "application/json");
    if (request.url !== "/api/embed") return response.end(JSON.stringify({ models: [] }));
    const ask = JSON.parse(body);
    asked.push(ask);
    if (ask.model === "missing") { response.statusCode = 404; return response.end(JSON.stringify({ error: "model not found" })); }
    response.end(JSON.stringify({ embeddings: ask.input.map((text) => [text.length, text.charCodeAt(0) || 0, 1]) }));
  });
});
await new Promise((resolve) => ollama.listen(0, "127.0.0.1", resolve));

const config = join(trial, "config.json");
writeFileSync(config, JSON.stringify({
  wakeWord: null, interruptWord: null, tts: null, engine: "piper", hotkey: null, echoCancel: false, record: "sleep 100", followUpSeconds: 0, folders: [], sight: [],
  ollama: { url: `http://127.0.0.1:${ollama.address().port}`, model: "fake", keepAlive: "1m" }, embedModel: "brain-embed", router: false,
}));
writeFileSync(join(trial, "key"), randomBytes(32).toString("base64") + "\n", { mode: 0o600 });
const env = { ...process.env, HEYMORGAN_SOCKET: socket, HEYMORGAN_ROLE: "local", HEYMORGAN_CLIENT_FILE: "/nonexistent", HEYMORGAN_CONFIG: config, HEYMORGAN_MEMORY: join(trial, "memory"), HEYMORGAN_KEY_FILE: join(trial, "key") };
const command = (line) => new Promise((resolve, reject) => {
  const client = connect(socket);
  let answer = "";
  client.on("connect", () => client.write(`${line}\n`));
  client.on("data", (chunk) => { answer += chunk; });
  client.on("error", reject);
  client.on("end", () => { try { resolve(JSON.parse(answer)); } catch { resolve({ raw: answer }); } });
});

rmSync(socket, { force: true });
const daemon = spawn(process.execPath, ["daemon.mjs"], { cwd: root, env, stdio: ["ignore", openSync(join(trial, "daemon.log"), "a"), openSync(join(trial, "daemon.log"), "a")] });
for (let i = 0; i < 80 && !existsSync(socket); i++) await sleep(250);
if (!existsSync(socket)) { console.error(readFileSync(join(trial, "daemon.log"), "utf8").slice(-1500)); process.exit(1); }

try {
  const a = await command(`embed ${JSON.stringify({ texts: ["search_query: tea", "search_document: a pot of tea"], model: "nomic-embed-text" })}`);
  check("embeddings, one per text, in order", a.ok && JSON.stringify(a.embeddings) === JSON.stringify([[17, 115, 1], [29, 115, 1]]), JSON.stringify(a));
  check("with the model asked for", a.model === "nomic-embed-text" && asked.at(-1)?.model === "nomic-embed-text");
  check("the texts as given, framing and all", JSON.stringify(asked.at(-1)?.input) === JSON.stringify(["search_query: tea", "search_document: a pot of tea"]));

  const b = await command(`embed ${JSON.stringify({ texts: ["x"] })}`);
  check("no model named: the brain's embedModel", b.ok && b.model === "brain-embed" && asked.at(-1)?.model === "brain-embed", JSON.stringify(b));

  const long = await command(`embed ${JSON.stringify({ texts: ["y".repeat(9000)] })}`);
  check("a text cut to 8000 characters", long.ok && asked.at(-1)?.input[0].length === 8000);

  const none = await command(`embed ${JSON.stringify({ texts: [] })}`);
  const many = await command(`embed ${JSON.stringify({ texts: Array.from({ length: 65 }, () => "z") })}`);
  check("1 to 64 texts", !none.ok && !many.ok && /1 to 64/.test(many.error ?? ""), JSON.stringify(many));

  const missing = await command(`embed ${JSON.stringify({ texts: ["q"], model: "missing" })}`);
  check("a model the server lacks: said, with which", !missing.ok && /404/.test(missing.error ?? "") && /missing/.test(missing.error ?? ""), JSON.stringify(missing));

  const bad = await command("embed not json");
  check("not JSON: said", !bad.ok && /embed wants JSON/.test(bad.error ?? ""));

  // Left running for a client's own test (Talaris's core), until it is done.
  if (process.argv[2]) {
    writeFileSync(process.argv[2], socket);
    while (existsSync(process.argv[2])) await sleep(200);
  }
} finally {
  daemon.kill("SIGTERM");
  ollama.close();
  await sleep(300);
  rmSync(trial, { recursive: true, force: true });
}
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
