// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 Jeff Moore
//
// Project chat: a conversation with one project at a time, kept on the brain so it is the same from every device.
//
// A project speaks for itself, not as Morgan: helpful with whatever it is asked, and always working out where it stands
// today against everything else going on. After each reply it says so in a line of its own (its `standing`: now, soon
// or later, and why), the seed of the claims Morgan will one day referee.
//
// What it knows comes from where the user keeps it. Asked from Talaris, each turn carries the project's brief
// (`context`: its About, its pages, canvases and files, its open tasks with their notes, the people they name, what is
// tied to it from elsewhere, and the rest of the day — due, overdue, the calendar); the latest is kept, for asking when
// no Talaris is about. With no brief and none kept, Hermes is asked instead, where it is connected. Its tools are the
// ones that say they only read: Talaris's (through the device that runs it) and Hermes', whichever are here.
//
// It is Morgan's model (`ollama`), nothing else of Morgan's: its own history (one file a project, under `projects/`)
// and its own prompt. Nothing here reaches the Oracle.
//
// One command, `project <json>`:
//   {op:"list"}                                 the projects Hermes has (Talaris lists its own)
//   {op:"history", project, name?}              what was said, and the standing
//   {op:"chat", project, name?, text, context?} a turn: { reply, standing }
//   {op:"clear", project, name?}                the conversation forgotten (the standing kept)
// `project` is the project's own id where the asker has one (Talaris's), else a Hermes id or title.

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Messages kept for the model: the latest this many (the file keeps more). */
const CONTEXT_MESSAGES = 24;
/** Messages kept in a project's file. */
const KEPT_MESSAGES = 200;
/** Tool rounds in one turn, at most. */
const ROUNDS = 5;
/** A kept brief older than this is said to be so. */
const STALE_MS = 12 * 60 * 60 * 1000;

const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;

/**
 * @param {object} o
 * @param {string} o.dir     where each project's conversation is kept
 * @param {() => object} o.cfg   the brain's settings, read at each turn (the model may be changed in settings)
 * @param {() => {server: string, call: (tool: string, args: object) => Promise<string>, tools: object[]}[]} o.sources
 *   the connections a project may read through — each its server's name, a call, and its read-only tools (MCP form)
 */
export function createProjects({ dir, cfg, sources }) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const busy = new Map(); // project key → the turn running, so two at once on one project wait in line

  const fileOf = (key) => join(dir, `${key}.json`);
  const load = (key) => {
    try { return JSON.parse(readFileSync(fileOf(key), "utf8")); } catch { return { id: key, name: "", messages: [], standing: null, brief: null }; }
  };
  const save = (state) => {
    state.messages = state.messages.slice(-KEPT_MESSAGES);
    const tmp = `${fileOf(state.id)}.tmp`;
    writeFileSync(tmp, JSON.stringify(state), { mode: 0o600 });
    renameSync(tmp, fileOf(state.id));
  };

  /** The tools a project may call, named `server__tool`, in Ollama's form; and how to call one by that name. */
  function toolbox() {
    const tools = [], calls = new Map();
    for (const s of sources()) {
      for (const t of s.tools) {
        const name = `${s.server}__${t.name}`;
        tools.push({ type: "function", function: { name, description: t.description ?? "", parameters: t.inputSchema ?? { type: "object", properties: {} } } });
        calls.set(name, (args) => s.call(t.name, args));
      }
    }
    return { tools, calls };
  }
  /** Hermes, where it is connected: the connection that can say a project's details. */
  const hermes = () => sources().find((s) => s.tools.some((t) => t.name === "project_info")) ?? null;

  /**
   * Which project: its key (the file its conversation is kept in) and name. An id the asker gives is taken as it is;
   * a title, or an id with nothing kept, is looked up in Hermes where it is connected.
   */
  async function which({ project, name }) {
    const asked = String(project ?? "").trim();
    if (!asked) throw new Error("which project?");
    if (SAFE_ID.test(asked) && (name || existsSync(fileOf(asked)))) return adopt(asked, String(name ?? "").trim());
    const h = hermes();
    if (!h) throw new Error(`no project ${asked} here`);
    const info = await h.call("project_info", { project: asked });
    const id = /^Id:\s*(\S+)/m.exec(info)?.[1];
    const title = /^Project:\s*(.+)$/m.exec(info)?.[1]?.trim();
    if (!id || !SAFE_ID.test(id)) throw new Error(info.split("\n")[0].slice(0, 200) || `no project ${asked}`);
    return { key: id, name: title || asked, info };
  }

  /**
   * A project asked by its own id for the first time, with a conversation kept under another (by Hermes' id, before
   * Talaris's were used): that conversation taken over, by its name.
   */
  function adopt(key, name) {
    if (!existsSync(fileOf(key)) && name) {
      for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
        const old = load(f.slice(0, -5));
        if (old.name === name && old.id !== key) {
          save({ ...old, id: key });
          renameSync(fileOf(old.id), `${fileOf(old.id)}.adopted`);
          break;
        }
      }
    }
    return { key, name: name || load(key).name || key, info: null };
  }

  async function list() {
    const h = hermes();
    if (!h) return [];
    const text = await h.call("project_list", {});
    const projects = [];
    for (const line of text.split("\n")) {
      const m = /^(.+?) — (\d+) open tasks? \(([0-9a-f-]{36})\)\s*$/i.exec(line.trim());
      if (m) projects.push({ id: m[3], name: m[1], open: Number(m[2]) });
    }
    return projects;
  }

  /** The day, from Hermes: for a project asked with no brief (Talaris's carries its own). */
  async function hermesDay() {
    const h = hermes();
    if (!h) return "";
    const zone = cfg().timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const iso = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const safely = async (tool, args) => { try { return (await h.call(tool, args)).trim(); } catch (error) { return `(${tool} failed: ${error.message})`; } };
    const [calendar, due, overdue] = await Promise.all([
      safely("calendar_events", { date: iso }),
      safely("task_find", { when: "today", status: "open", limit: 40 }),
      safely("task_find", { when: "overdue", status: "open", limit: 40 }),
    ]);
    return ["Today's calendar:", calendar || "(nothing)", "", "Due today, across every project:", due || "(nothing)", "",
      "Overdue, across every project:", overdue || "(nothing)"].join("\n");
  }

  function prompt(name, facts) {
    const c = cfg();
    const who = c.userName || "the user";
    const zone = c.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const now = new Date();
    const day = now.toLocaleDateString("en-US", { timeZone: zone, weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const hour = now.toLocaleTimeString("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" });
    return [
      `You are the project "${name}", talking with ${who} in a text chat. You speak for this project — its purpose, its tasks,`,
      "its commitments, its pages and canvases — in the first person (\"I\", \"my tasks\"). You are not Morgan and not a general assistant.",
      "",
      `Be genuinely helpful with whatever ${who} asks about this project: planning, next steps, drafting, thinking it through.`,
      "Always keep track of where this project stands TODAY against everything else on their plate (the calendar, what is",
      "due and overdue across all projects, below). When it bears on the conversation, say plainly whether this project",
      "deserves their attention today or should wait, and why. Be honest when something else matters more than you.",
      "",
      "Look things up rather than offering to: when a question touches a page, a canvas, a task's details, a person or",
      "anything tied to the project, read it with your tools first and answer from what it says. Your tools only read.",
      "You cannot change anything: when a change would help, say exactly what to do and the user will do it.",
      "Use only the facts given here or returned by your tools. Never invent dates, durations, prices or rules.",
      "Dates: compare against today's date; something due later this week has not passed.",
      "Keep replies short and plain, light markdown at most.",
      "",
      `Now: ${day}, ${hour} (${zone}).`,
      "",
      "=== This project, and the day ===",
      facts.trim(),
    ].join("\n");
  }

  async function ollama(body) {
    const c = cfg();
    const response = await fetch(`${c.ollama.url}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(170_000),
      body: JSON.stringify({ model: c.ollama.model, stream: false, think: false, keep_alive: c.ollama.keepAlive, ...body }),
    });
    if (!response.ok) throw new Error(`Ollama answered ${response.status}: ${(await response.text()).slice(0, 200)}`);
    return (await response.json()).message ?? {};
  }

  /** Where the project stands today, from the conversation and the facts: { today: now|soon|later, why }. */
  async function stand(system, messages) {
    try {
      const said = await ollama({
        options: { temperature: 0 },
        format: {
          type: "object",
          properties: {
            why: { type: "string", description: "one short sentence (under 25 words), from the facts given: why this project does or does not need the user today" },
            today: { type: "string", enum: ["now", "soon", "later"], description: "now = this project should get the user's attention today, ahead of other things; soon = in the next few days; later = it can wait" },
          },
          required: ["why", "today"],
        },
        messages: [{ role: "system", content: system }, ...messages,
          { role: "user", content: "Leaving the conversation aside: against everything else on the user's plate today, should THIS project get their attention today (now), in the next few days (soon), or can it wait (later)? Give the reason first, then the answer that follows from it." }],
      });
      const got = JSON.parse(said.content);
      if (!["now", "soon", "later"].includes(got.today)) return null;
      return { today: got.today, why: String(got.why ?? "").slice(0, 300), t: Date.now() };
    } catch { return null; }
  }

  async function chat(ask) {
    const said = String(ask.text ?? "").trim();
    if (!said) throw new Error("nothing said");
    const { key, name, info } = await which(ask);
    // One turn at a time on a project: a second waits for the first.
    const before = busy.get(key) ?? Promise.resolve();
    let done;
    const mine = new Promise((r) => { done = r; });
    const chained = before.then(() => mine);
    busy.set(key, chained);
    await before;
    try {
      const state = load(key);
      state.id = key;
      state.name = name;
      // What it knows: the brief brought now, else the one kept (said how old), else Hermes'.
      const context = typeof ask.context === "string" ? ask.context.trim() : "";
      let facts;
      if (context) {
        state.brief = { text: context, t: Date.now() };
        facts = context;
      } else if (state.brief?.text) {
        const age = Date.now() - state.brief.t;
        facts = `${state.brief.text}${age > STALE_MS ? `\n\n(This was as of ${new Date(state.brief.t).toLocaleString("en-US")}; it may be out of date.)` : ""}`;
      } else {
        const project = info ?? (hermes() ? await hermes().call("project_info", { project: name }).catch(() => "") : "");
        if (!project) throw new Error(`nothing known of ${name} here: ask from Talaris once`);
        facts = `${project}\n\n${await hermesDay()}`;
      }
      const system = prompt(name, facts);
      const { tools, calls } = toolbox();
      const talk = [...state.messages.slice(-CONTEXT_MESSAGES).map(({ role, content }) => ({ role, content })), { role: "user", content: said }];
      let reply = "";
      for (let round = 0; round <= ROUNDS; round++) {
        const message = await ollama({ messages: [{ role: "system", content: system }, ...talk], ...(round < ROUNDS && tools.length ? { tools } : {}) });
        const asked = message.tool_calls ?? [];
        if (!asked.length) { reply = String(message.content ?? "").replace(/^\s*(?:thought|thinking)\s*\n/i, "").trim(); break; }
        talk.push({ role: "assistant", content: message.content ?? "", tool_calls: asked });
        for (const call of asked) {
          const toolName = call.function?.name ?? "";
          const run = calls.get(toolName);
          let result;
          if (!run) result = `Unknown tool: ${toolName}`;
          else {
            try { result = String(await run(call.function.arguments ?? {})).slice(0, 10_000); } catch (error) { result = `The tool failed: ${error.message}`; }
          }
          talk.push({ role: "tool", content: result, tool_name: toolName });
        }
      }
      if (!reply) reply = "I couldn't put an answer together just now.";
      state.messages.push({ role: "user", content: said, t: Date.now() }, { role: "assistant", content: reply, t: Date.now() });
      state.standing = (await stand(system, [...talk.filter((m) => m.role !== "tool" && !m.tool_calls), { role: "assistant", content: reply }])) ?? state.standing;
      save(state);
      return { id: key, name, reply, standing: state.standing };
    } finally {
      done();
      if (busy.get(key) === chained) busy.delete(key);
    }
  }

  async function history(ask) {
    const { key, name } = await which(ask);
    const state = load(key);
    return { id: key, name: state.name || name, messages: state.messages.map(({ role, content, t }) => ({ role, content, t })), standing: state.standing };
  }

  async function clear(ask) {
    const { key, name } = await which(ask);
    if (existsSync(fileOf(key))) {
      const state = load(key);
      state.messages = [];
      save(state);
    }
    return { id: key, name };
  }

  /** The `project <json>` command: its answer, as the socket sends it back. */
  async function command(json) {
    let ask;
    try { ask = JSON.parse(json || "{}"); } catch { return { ok: false, error: "project wants JSON: { op, project, text }" }; }
    try {
      switch (ask.op) {
        case "list": return { ok: true, projects: await list() };
        case "history": return { ok: true, ...(await history(ask)) };
        case "chat": return { ok: true, ...(await chat(ask)) };
        case "clear": return { ok: true, ...(await clear(ask)) };
        default: return { ok: false, error: "op: list | history | chat | clear" };
      }
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }

  return { command };
}
