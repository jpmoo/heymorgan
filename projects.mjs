// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 Jeff Moore
//
// Project chat: a conversation with one project at a time, kept on the brain so it is the same from every device.
//
// A project speaks for itself, not as Morgan: helpful with whatever it is asked, and always working out where it stands
// today against everything else going on — what is due today and overdue across every project, and today's calendar.
// After each reply it says so in a line of its own (its `standing`: now, soon or later, and why), the seed of the
// claims Morgan will one day referee.
//
// It is Morgan's model (`ollama`) and Morgan's Hermes connection, nothing else of Morgan's: its own history (one file a
// project, under `projects/`), its own prompt, and only the tools that say they only read. Nothing here reaches the
// Oracle.
//
// One command, `project <json>`:
//   {op:"list"}                       the projects, with their open counts
//   {op:"history", project}           what was said, and the standing
//   {op:"chat", project, text}        a turn: { reply, standing }
//   {op:"clear", project}             the conversation forgotten (the standing kept)
// `project` is a Hermes project's id or its title.

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Messages kept for the model: the latest this many (the file keeps more). */
const CONTEXT_MESSAGES = 24;
/** Messages kept in a project's file. */
const KEPT_MESSAGES = 200;
/** Tool rounds in one turn, at most. */
const ROUNDS = 4;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * @param {object} o
 * @param {string} o.dir          where each project's conversation is kept
 * @param {() => object} o.cfg    the brain's settings, read at each turn (the model may be changed in settings)
 * @param {() => {name: string, call: (tool: string, args: object) => Promise<string>, tools: object[]} | null} o.hermes
 *   the Hermes connection: its server name, a call, and its read-only tools in Ollama's form (named `tool`, unprefixed)
 */
export function createProjects({ dir, cfg, hermes }) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const busy = new Map(); // project id → the turn running, so two at once on one project wait in line

  const fileOf = (id) => join(dir, `${id}.json`);
  const load = (id) => {
    try { return JSON.parse(readFileSync(fileOf(id), "utf8")); } catch { return { id, name: "", messages: [], standing: null }; }
  };
  const save = (state) => {
    state.messages = state.messages.slice(-KEPT_MESSAGES);
    const tmp = `${fileOf(state.id)}.tmp`;
    writeFileSync(tmp, JSON.stringify(state), { mode: 0o600 });
    renameSync(tmp, fileOf(state.id));
  };

  const link = () => {
    const h = hermes();
    if (!h) throw new Error("Hermes isn't connected on the brain");
    return h;
  };

  /** A project by id or title: its id, name and Hermes' account of it (about, fields, open tasks). */
  async function resolve(project) {
    const asked = String(project ?? "").trim();
    if (!asked) throw new Error("which project?");
    const info = await link().call("project_info", { project: asked });
    const id = /^Id:\s*(\S+)/m.exec(info)?.[1];
    const name = /^Project:\s*(.+)$/m.exec(info)?.[1]?.trim();
    if (!id || !UUID.test(id)) throw new Error(info.split("\n")[0].slice(0, 200) || `no project ${asked}`);
    return { id, name: name || asked, info };
  }

  async function list() {
    const text = await link().call("project_list", {});
    const projects = [];
    for (const line of text.split("\n")) {
      const m = /^(.+?) — (\d+) open tasks? \(([0-9a-f-]{36})\)\s*$/i.exec(line.trim());
      if (m) projects.push({ id: m[3], name: m[1], open: Number(m[2]) });
    }
    return projects;
  }

  /** Today, as the project weighs itself against it: the day and hour, the calendar, what is due and overdue everywhere. */
  async function today() {
    const c = cfg();
    const zone = c.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const now = new Date();
    const day = now.toLocaleDateString("en-US", { timeZone: zone, weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const hour = now.toLocaleTimeString("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" });
    const iso = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    const h = link();
    const safely = async (tool, args) => { try { return (await h.call(tool, args)).trim(); } catch (error) { return `(${tool} failed: ${error.message})`; } };
    const [calendar, due, overdue] = await Promise.all([
      safely("calendar_events", { date: iso }),
      safely("task_find", { when: "today", status: "open", limit: 40 }),
      safely("task_find", { when: "overdue", status: "open", limit: 40 }),
    ]);
    return { iso, text: [`Now: ${day}, ${hour} (${zone}).`, "", "Today's calendar:", calendar || "(nothing)", "",
      "Due today, across every project:", due || "(nothing)", "", "Overdue, across every project:", overdue || "(nothing)"].join("\n") };
  }

  function prompt(name, info, day) {
    const who = cfg().userName || "the user";
    return [
      `You are the project "${name}", talking with ${who} in a text chat. You speak for this project — its purpose, its tasks,`,
      "its commitments — in the first person (\"I\", \"my tasks\"). You are not Morgan and not a general assistant.",
      "",
      `Be genuinely helpful with whatever ${who} asks about this project: planning, next steps, drafting, thinking it through.`,
      "Always keep track of where this project stands TODAY against everything else on their plate (the calendar, what is",
      "due and overdue across all projects, below). When it bears on the conversation, say plainly whether this project",
      "deserves their attention today or should wait, and why. Be honest when something else matters more than you.",
      "",
      "Use only the facts given here or returned by your tools. Never invent dates, durations, prices or rules.",
      "Dates: compare against today's date below; something due later this week has not passed.",
      "You can look things up with your tools (they only read). You cannot change anything: when a change would help,",
      "say exactly what to do and the user will do it.",
      "Keep replies short and plain, light markdown at most.",
      "",
      "=== This project, from Hermes ===",
      info.trim(),
      "",
      "=== Today ===",
      day.text,
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

  async function chat(project, text) {
    const said = String(text ?? "").trim();
    if (!said) throw new Error("nothing said");
    const { id, name, info } = await resolve(project);
    // One turn at a time on a project: a second waits for the first.
    const before = busy.get(id) ?? Promise.resolve();
    let done;
    const mine = new Promise((r) => { done = r; });
    const chained = before.then(() => mine);
    busy.set(id, chained);
    await before;
    try {
      const state = load(id);
      state.name = name;
      const h = link();
      const day = await today();
      const system = prompt(name, info, day);
      const asked = { role: "user", content: said, t: Date.now() };
      const talk = [...state.messages.slice(-CONTEXT_MESSAGES).map(({ role, content }) => ({ role, content })), { role: "user", content: said }];
      const tools = h.tools;
      let reply = "";
      for (let round = 0; round <= ROUNDS; round++) {
        const message = await ollama({ messages: [{ role: "system", content: system }, ...talk], ...(round < ROUNDS && tools.length ? { tools } : {}) });
        const calls = message.tool_calls ?? [];
        if (!calls.length) { reply = String(message.content ?? "").replace(/^\s*(?:thought|thinking)\s*\n/i, "").trim(); break; }
        talk.push({ role: "assistant", content: message.content ?? "", tool_calls: calls });
        for (const call of calls) {
          const toolName = call.function?.name ?? "";
          let result;
          if (!tools.some((t) => t.function.name === toolName)) result = `Unknown tool: ${toolName}`;
          else {
            try { result = (await h.call(toolName, call.function.arguments ?? {})).slice(0, 8000); } catch (error) { result = `The tool failed: ${error.message}`; }
          }
          talk.push({ role: "tool", content: result, tool_name: toolName });
        }
      }
      if (!reply) reply = "I couldn't put an answer together just now.";
      state.messages.push(asked, { role: "assistant", content: reply, t: Date.now() });
      state.standing = (await stand(system, [...talk.filter((m) => m.role !== "tool" && !m.tool_calls), { role: "assistant", content: reply }])) ?? state.standing;
      save(state);
      return { id, name, reply, standing: state.standing };
    } finally {
      done();
      if (busy.get(id) === chained) busy.delete(id);
    }
  }

  async function history(project) {
    const { id, name } = await resolve(project);
    const state = load(id);
    return { id, name, messages: state.messages.map(({ role, content, t }) => ({ role, content, t })), standing: state.standing };
  }

  async function clear(project) {
    const { id, name } = await resolve(project);
    const state = load(id);
    state.messages = [];
    if (existsSync(fileOf(id))) save(state); else rmSync(fileOf(id), { force: true });
    return { id, name };
  }

  /** The `project <json>` command: its answer, as the socket sends it back. */
  async function command(json) {
    let ask;
    try { ask = JSON.parse(json || "{}"); } catch { return { ok: false, error: "project wants JSON: { op, project, text }" }; }
    try {
      switch (ask.op) {
        case "list": return { ok: true, projects: await list() };
        case "history": return { ok: true, ...(await history(ask.project)) };
        case "chat": return { ok: true, ...(await chat(ask.project, ask.text)) };
        case "clear": return { ok: true, ...(await clear(ask.project)) };
        default: return { ok: false, error: "op: list | history | chat | clear" };
      }
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }

  return { command };
}
