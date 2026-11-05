#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 Jeff Moore
// Incognito and deleting history, on a Morgan of its own: its own folder and
// socket, never a client of the real server, nothing to look with, and a stand-in
// for the model, the embedder, a tool server and the Oracle, so that what is
// tried is tried for certain and what reached them can be read back.
//
//   node tests/incognito.mjs
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdtempSync, openSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const trial = mkdtempSync(join(tmpdir(), "morgan-incognito-"));
const socket = join(trial, "morgan.sock");
const history = join(trial, "memory", "history");
const toolLog = join(trial, "tool.log");
const oracleLog = join(trial, "oracle.log");
let failed = 0;
const check = (name, ok, more = "") => { if (!ok) failed++; console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && more ? `: ${more}` : ""}`); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---- the stand-in for the model
const fill = (schema) => {
  if (schema?.enum) return schema.enum[0];
  if (schema?.type === "object") return Object.fromEntries(Object.entries(schema.properties ?? {}).map(([key, value]) => [key, fill(value)]));
  return { boolean: false, string: "", integer: 0, number: 0, array: [] }[Array.isArray(schema?.type) ? schema.type[0] : schema?.type] ?? null;
};
const asked = []; // the words of every message of every turn the model was given
const reply = (message) => ({ model: "fake", message: { role: "assistant", ...message }, done: true });
const ollama = createServer((request, response) => {
  let body = "";
  request.on("data", (chunk) => { body += chunk; });
  request.on("end", () => {
    const send = (value) => { response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify(value)); };
    if (request.url === "/api/embed") {
      const hash = createHash("sha256").update(body).digest();
      return send({ embeddings: [[...hash.subarray(0, 8)].map((x) => x / 255 + 0.01)] });
    }
    if (request.url !== "/api/chat") return send({ models: [] });
    const ask = JSON.parse(body);
    if (ask.format) {
      const made = fill(ask.format);
      // The sorter, on the message alone and not what was said before it.
      const said = String(ask.messages.at(-1)?.content ?? "").split("The message to sort:").at(-1);
      if ("calls_for" in made) made.calls_for = [...(/remember/i.test(said) ? ["asks_to_keep"] : []), ...(/USE-ORACLE/.test(said) ? ["oracle"] : [])];
      return send(reply({ content: JSON.stringify(made) }));
    }
    if (!ask.stream) return send(reply({ content: "done" }));
    asked.push(ask.messages.map((message) => String(message.content ?? "")).join("\n"));
    const last = ask.messages.at(-1);
    // What was said, not the notes after it, which may bring back earlier talk.
    const user = String(ask.messages.findLast((message) => message.role === "user")?.content ?? "").split("\n")[0];
    const call = (name, args) => ({ content: "", tool_calls: [{ function: { name, arguments: args } }] });
    let message = { content: "An answer." };
    if (last.role !== "tool") {
      if (user.includes("USE-REMEMBER")) message = call("remember", { topic: "Testing", note: "the note SECRETNOTE" });
      else if (user.includes("USE-WRITE")) message = call("fake__write_thing", { what: "SECRETWRITE" });
      else if (user.includes("USE-READ")) message = call("fake__read_thing", {});
      else if (user.includes("USE-ORACLE")) message = call("consult_oracle", { question: "SECRETORACLE" });
    }
    response.write(JSON.stringify(reply(message)) + "\n");
    response.end();
  });
});
await new Promise((resolve) => ollama.listen(0, "127.0.0.1", resolve));

// ---- the stand-ins for a tool server and the Oracle
const server = join(trial, "tools.mjs");
writeFileSync(server, `import { appendFileSync } from "node:fs";
import { createInterface } from "node:readline";
createInterface({ input: process.stdin }).on("line", (line) => {
  const { id, method, params } = JSON.parse(line);
  if (id === undefined) return;
  const result = method === "initialize" ? { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "fake", version: "1" } }
    : method === "tools/list" ? { tools: [
      { name: "read_thing", description: "Reads.", inputSchema: { type: "object", properties: {} }, annotations: { readOnlyHint: true } },
      { name: "write_thing", description: "Writes.", inputSchema: { type: "object", properties: { what: { type: "string" } } } }] }
    : (appendFileSync(${JSON.stringify(toolLog)}, params.name + "\\n"), { content: [{ type: "text", text: "from the tool" }] });
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\\n");
});
`);
const oracle = join(trial, "claude");
writeFileSync(oracle, `#!/bin/sh\nwhile read -r line; do printf '%s\\n' "$line" >> ${JSON.stringify(oracleLog)}; printf '%s\\n' '{"type":"result","result":"from the Oracle"}'; done\n`);
chmodSync(oracle, 0o700);

const config = join(trial, "config.json");
writeFileSync(config, JSON.stringify({
  wakeWord: null, interruptWord: null, tts: null, engine: "piper", hotkey: null, echoCancel: false, record: "sleep 100", followUpSeconds: 0, folders: [], sight: [],
  ollama: { url: `http://127.0.0.1:${ollama.address().port}`, model: "fake", keepAlive: "1m" }, embedModel: "fake-embed", router: false,
  oracle: { claude: oracle },
  mcpServers: { fake: { command: process.execPath, args: [server], tools: { read_thing: "allow", write_thing: "allow" } } },
}));

// ---- the Morgan under trial
let daemon = null;
writeFileSync(join(trial, "key"), randomBytes(32).toString("base64") + "\n", { mode: 0o600 });
const logFile = () => openSync(join(trial, "daemon.log"), "a");
const env = { ...process.env, HEYMORGAN_SOCKET: socket, HEYMORGAN_ROLE: "local", HEYMORGAN_CLIENT_FILE: "/nonexistent", HEYMORGAN_CONFIG: config, HEYMORGAN_MEMORY: join(trial, "memory"), HEYMORGAN_KEY_FILE: join(trial, "key") };
const command = (line) => new Promise((resolve, reject) => {
  const client = connect(socket);
  let answer = "";
  client.on("connect", () => client.write(`${line}\n`));
  client.on("data", (chunk) => { answer += chunk; });
  client.on("error", reject);
  client.on("end", () => { try { resolve(JSON.parse(answer)); } catch { resolve({ raw: answer }); } });
});
async function start() {
  rmSync(socket, { force: true });
  daemon = spawn(process.execPath, ["daemon.mjs"], { cwd: root, env, stdio: ["ignore", logFile(), logFile()] });
  for (let i = 0; i < 80 && !existsSync(socket); i++) await sleep(250);
  if (!existsSync(socket)) throw new Error(`it did not start:\n${readFileSync(join(trial, "daemon.log"), "utf8").slice(-1500)}`);
  await sleep(2500); // the tool server, connecting
}
const stop = () => new Promise((resolve) => { daemon.once("exit", resolve); daemon.kill("SIGTERM"); });
async function say(text) {
  await command(`type ${text}`);
  await sleep(150);
  for (let i = 0; i < 80; i++) { if ((await command("status")).state === "idle") break; await sleep(150); }
  await sleep(150);
}
// Everything on disk: the same before and after is the whole of "nothing kept".
function everything(dir = trial, into = {}) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (name === "morgan.sock" || name === "daemon.log" || path === toolLog || path === oracleLog || path === config) continue;
    if (statSync(path).isDirectory()) everything(path, into);
    else into[path.slice(trial.length)] = createHash("sha256").update(readFileSync(path)).digest("hex");
  }
  return into;
}
const lineCount = (name) => { const file = join(history, name); return existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean).length : 0; };
const tools = () => (existsSync(toolLog) ? readFileSync(toolLog, "utf8") : "");
const notes = async () => (await command(`admin ${JSON.stringify({ op: "memory.list", args: {} })}`)).topics?.flatMap((topic) => topic.notes) ?? [];
const settled = async () => { let before = ""; for (let i = 0; i < 40; i++) { await sleep(300); const now = JSON.stringify(everything()); if (now === before) return; before = now; } };

try {
  await start();

  console.log("== incognito");
  await say("An ordinary thing, on the record.");
  check("an ordinary exchange is kept", lineCount("exchanges.sealed") === 1);
  check("off to begin with", (await command("status")).incognito === false);
  // What is closed below is open here, so that it being closed there means something.
  await say("USE-WRITE, on the record.");
  check("control: the tool that writes is called when not incognito", tools().includes("write_thing"), tools());
  await say("USE-ORACLE, on the record.");
  check("control: the Oracle is sent the question when not incognito", existsSync(oracleLog));
  rmSync(toolLog, { force: true });
  rmSync(oracleLog, { force: true });
  const ordinary = lineCount("exchanges.sealed");
  await command("incognito on");
  check("on when told", (await command("status")).incognito === true);
  await settled();
  const before = everything();
  const notesBefore = (await notes()).length;
  const words = ["My secret is SECRETPLAIN.", "USE-REMEMBER that SECRETPLAIN2.", "Remember that my SECRETPLAIN3 is true.", "USE-WRITE please.", "USE-ORACLE please."];
  for (const said of words) await say(said);
  await say("USE-READ please.");
  check("the tool that reads is still read", tools().includes("read_thing"), tools());
  check("the tool that writes is not called, though told to", !tools().includes("write_thing"), tools());
  check("no note, though told to", (await notes()).length === notesBefore);
  check("the Oracle is sent nothing", !existsSync(oracleLog), existsSync(oracleLog) ? readFileSync(oracleLog, "utf8").slice(0, 200) : "");
  check("the model is told it is incognito", asked.at(-1).includes("You are incognito"));
  check("earlier conversations are still consulted", asked.at(-1).includes("An ordinary thing"));
  check("the conversation is in front of the model while it lasts", asked.at(-1).includes("SECRETPLAIN"));
  const open = await command("recent 50");
  check("what opens now shows what is in hand, marked unkept, and nothing earlier", open.items.length === words.length + 1 && open.items.every((item) => item.unkept), JSON.stringify(open.items?.length));
  const after = everything();
  const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((path) => before[path] !== after[path]);
  check("not one byte on disk has changed", !changed.length, changed.join(", "));
  check("nothing in the calendar", !JSON.stringify(await command(`days ${new Date().toISOString().slice(0, 7)}`)).includes("SECRET"));

  await stop();
  await start();
  check("a restart does not turn it off", (await command("status")).incognito === true);
  check("nor bring back what was said", !(await command("recent 50")).items.length);
  await say("leave incognito");
  check("said aloud or typed, it goes off", (await command("status")).incognito === false);
  check("nothing is left to say it was on", !existsSync(join(history, "incognito")));
  await say("A second ordinary thing.");
  check("then what is said is kept", lineCount("exchanges.sealed") === ordinary + 1);
  check("and the incognito talk is not in front of the model", !asked.at(-1).includes("SECRETPLAIN"));
  await say("go incognito");
  check("go incognito, in words", (await command("status")).incognito === true);
  await say("Incognito is a fine word for a hat, I think.");
  check("the word in a sentence is only a sentence", (await command("status")).incognito === true && lineCount("exchanges.sealed") === ordinary + 1);
  await command("incognito off");

  console.log("== deleting");
  await command("new");
  await settled();
  await say("USE-REMEMBER a thing worth keeping.");
  const withNote = lineCount("exchanges.sealed");
  check("a note taken from an exchange", (await notes()).some((note) => note.includes("SECRETNOTE")));
  const list = (await command("recent 50")).items;
  const noted = list.at(-1).t;
  const preview = await command(`delete exchange ${noted} --preview`);
  check("the preview names it and its note, and deletes nothing", preview.exchanges === 1 && preview.notes.some((entry) => entry.note.includes("SECRETNOTE")) && lineCount("exchanges.sealed") === withNote, JSON.stringify(preview));
  const deleted = await command(`delete exchange ${noted} --notes`);
  check("deleted, with the note", deleted.exchanges === 1 && !(await notes()).some((note) => note.includes("SECRETNOTE")), JSON.stringify(deleted));
  await say("Now then.");
  check("it is out of the conversation in hand", !asked.at(-1).includes("USE-REMEMBER"));

  await command("new");
  await settled();
  await say("A DOOMED remark for a conversation of its own.");
  const unfiled = (await command("threads")).unfiled;
  check("a conversation still going is listed, by its first words, before it has a thread", unfiled.some((entry) => entry.title.includes("DOOMED") && entry.id.startsWith("u")), JSON.stringify(unfiled));
  check("and it opens", (await command(`conversation ${unfiled.find((entry) => entry.title.includes("DOOMED")).id}`)).ok === true);
  await command("new");
  await settled();
  check("once ended it is a thread, and no longer listed as unfiled", !(await command("threads")).unfiled.some((entry) => entry.title.includes("DOOMED")));
  const threads = (await command("threads")).threads;
  const doomed = threads.at(-1);
  check("it became a thread", doomed && doomed.exchanges === 1, JSON.stringify(threads));
  const copy = readFileSync(join(history, "exchanges.sealed"), "utf8");
  const gone = await command(`delete conversation ${doomed.id}`);
  check("a conversation deleted", gone.exchanges === 1 && gone.threads === 1, JSON.stringify(gone));
  check("off the file", readFileSync(join(history, "exchanges.sealed"), "utf8") !== copy);
  const left = await command("threads");
  check("out of the threads, and named as deleted", !left.threads.some((thread) => thread.id === doomed.id) && left.deleted.includes(doomed.id));
  check("not found by opening it", (await command(`conversation ${doomed.id}`)).ok === false);
  check("no embeddings left behind", lineCount("vectors.sealed") === lineCount("exchanges.sealed") && lineCount("thread-vectors.sealed") === lineCount("threads.sealed"),
    `${lineCount("vectors.sealed")}/${lineCount("exchanges.sealed")} ${lineCount("thread-vectors.sealed")}/${lineCount("threads.sealed")}`);
  await stop();
  await start();
  check("still gone after a restart", !(await command("recent 500")).items.some((item) => item.user.includes("DOOMED")));
  await say("An UNFILED remark, deleted before it is ever a thread.");
  const loose = (await command("threads")).unfiled.find((entry) => entry.title.includes("UNFILED"));
  await command(`delete conversation ${loose.id}`);
  const after2 = await command("threads");
  check("a conversation with no thread yet can be deleted, and is named as deleted", !after2.unfiled.some((entry) => entry.id === loose.id) && after2.deleted.includes(loose.id));
  const day = new Date();
  const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
  check("a day's preview counts what is left", (await command(`delete day ${iso} --preview`)).exchanges === lineCount("exchanges.sealed"));
  // Two zones that are never on the same date: a day is the one the asker's clock says.
  const dayIn = (timeZone) => new Date().toLocaleDateString("en-CA", { timeZone });
  const east = dayIn("Pacific/Kiritimati"), west = dayIn("Pacific/Pago_Pago");
  await say("A remark for the calendar.");
  const inEast = await command(`days ${east.slice(0, 7)} Pacific/Kiritimati`), inWest = await command(`days ${west.slice(0, 7)} Pacific/Pago_Pago`);
  check("the calendar's days are by the asker's clock", inEast.today === east && inWest.today === west && east !== west && inEast.days[east]?.length > 0 && inWest.days[west]?.length > 0 && !inEast.days[west],
    JSON.stringify([east, west, inEast.today, inWest.today]));
  check("and so is deleting a day", (await command(`delete day ${east} --zone=Pacific/Kiritimati --preview`)).exchanges > 0 && (await command(`delete day ${east} --zone=Pacific/Pago_Pago --preview`)).exchanges === 0);
  await command("delete all");
  await settled();
  check("all of it", lineCount("exchanges.sealed") === 0 && lineCount("vectors.sealed") === 0 && lineCount("threads.sealed") === 0 && lineCount("thread-vectors.sealed") === 0,
    `${lineCount("exchanges.sealed")} ${lineCount("vectors.sealed")} ${lineCount("threads.sealed")} ${lineCount("thread-vectors.sealed")}`);
  check("and nothing there to delete after that", (await command("delete all")).ok === false);
  check("a wrong delete is refused", (await command("delete everything")).ok === false);
} finally {
  daemon?.kill("SIGKILL");
  ollama.close();
  rmSync(trial, { recursive: true, force: true });
}
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
