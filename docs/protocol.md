# Morgan's client protocol

**Version 1.11**, written 2026-10-23 from the code as it stands (`daemon.mjs`,
`admin.mjs`, `env.mjs`, `access.mjs`, `speech.mjs`, `speaker.mjs`). It describes what the daemon does, not
what it was meant to do; where the two differ, or where the behavior would
surprise someone building on it, a **Note** says so.

- **1.11** (2026-10-30): **brain and device.** Wherever the brain runs it is
  a server, for however many devices: a laptop with its own brain runs it as a
  second service (`heymorgan serve`, heymorgan-brain) and its device reaches it
  at `localhost:8790` with a key, as a Pi reaches the home server; only the
  address differs (§5). **Speech on the brain:** a device sends what it heard
  and gets back words, sends a sentence and gets back sound (`speech` messages,
  §6), unless it is set to do its own (`speech`). **Voices on the brain:** one
  set every device shares, made by the first device a voice is taught on, and a
  device's own for a voice taught again there (`enroll --here`, `--everywhere`,
  `--device`; `voices` says `where` and each print's `own`). **Two devices, one
  wake word:** the brain lets the one that heard it best answer (`wake`, §6).
  **Devices:** `devices.list`, `devices.add`, `devices.remove`; `client.get`
  says `brainHere` and `housed`; `client.set` takes `here: true`. **A device's
  button and lights:** `mute`, the `lights` setting, and a `muted` event.
  `status` says `speech` and `muted`.
- **1.10** (2026-10-27): `reminders` (and `reminders.list`, `reminders.cancel`)
  say `now`, the clock `at` and `made` are on. A client counting a timer down
  on its own clock was off by as much as the two clocks differ (14 seconds,
  found with a server's clock running fast); it counts from `at - now` instead.
  A `reminder` event with `cancelled: true` says one was cancelled, so a
  window showing it can let it go; before, only the window that cancelled it knew.
- **1.9** (2026-10-27): `describe` with `"what": "project"` — the text is
  a project's tasks, done and to do, and the answer is the project's own description; the
  reply says `what` back, so a client can tell an older Morgan, which takes
  everything for a file.
- **1.8** (2026-10-27): `threads` gives each thread's `id`, `t1` and `ts`
  (its exchanges' times), so a client can keep hold of a thread, and find where
  one went when it was merged into another.
- **1.7** (2026-10-26): `describe <json>` — a picture described quietly, for
  a client that reads files (nothing said, kept or recorded); `visionModel` in
  `config.get` and `config.set` — the model that looks, everywhere Morgan does
  (camera, screen, clipboard, pictures read), empty for the chat model; and
  `vision.check`, which says whether each can see.
- **1.6** (2026-10-26): `memory.hold` — while a demo is shown, nothing new is
  remembered (no notes, documents or pictures kept, no tidying), for some hours
  at most and not across a restart; `memory.hold.get`, and `memoryHeld` in
  `status`.
- **1.5** (2026-10-25): each MCP tool is **allow** (run when called), **ask**
  (put to the user for a yes first) or **off** — `mode` in `mcp.list`, set with
  `mcp.tool`'s `mode`; a client's offered tools carry their `mode`; and
  `client.mcp.*` changes a client's own servers in its `client.json`, from its
  own socket. `on` and true/false still work.
- **1.4** (2026-10-24): a client's own MCP servers — `mcpServers` in
  `client.json`, offered in the hello's `tools` and `can: ["mcp"]`, run on the
  `mcp` ability; `mcp.list` shows them with `device`.
- **1.3** (2026-10-23): `search <text>`, past conversations by meaning and
  words, for a launcher. The query is embedded where Morgan's brain is, never
  on the asking machine.
- **1.2** (2026-10-23): the `timeZone` setting (`config.get` and `config.set`),
  taking effect at once. Every time Morgan says or records — `when`,
  `askedWhen`, the time the model is told, "today" — is in that zone.
- **1.1** (2026-10-23): Morgan's code was renamed from heyclaude to heymorgan
  (`docs/rename.md`). The socket is `heymorgan.sock`, and `heyclaude.sock` is
  still answered, as the same socket; the environment variables are
  `HEYMORGAN_*`, and `HEYCLAUDE_*` are still read. A new client uses only the
  new names.
- **1.0** (2026-10-23): first written down.

Everything that is not Morgan's brain — the Noctalia plugin, the conversation
window, the `heymorgan` command, Talaris, a speaker such as the Echo Dot —
talks to the daemon in one of two ways:

1. **The local socket** (§1–§4): a Unix socket on the same machine. This is what
   every face uses: it reaches that machine's device daemon, whether the brain
   is on the same machine or another.
2. **The server link** (§6): a WebSocket from a device daemon to its brain. A
   face never needs it — the device daemon speaks it on the face's behalf — but
   a device with no daemon of its own would.

## Versioning

The version is `MAJOR.MINOR`.

- **Minor** (1.0 → 1.1): something is added that an existing client can ignore —
  a new command, a new event type, a new field in a reply or an event, a new
  admin op, a new value a client may send.
- **Major** (1.x → 2.0): anything an existing client could trip over — a command,
  event type, field or admin op removed or renamed; a field's type or meaning
  changed; a reply that was one line becoming several, or the reverse; the
  socket's path or framing changed; a value the daemon used to accept now
  refused; a role's forwarding rules (§5) changed so that a command is answered
  by a different machine.

Clients must ignore event types and fields they do not know. A reply's `ok` and
`error` (§2) and an event's `type` are the only fields guaranteed on every
message.

**Note:** the daemon does not yet report which protocol version it speaks. Until
it does, a client cannot ask; it can only tolerate unknown events and fields.
Adding a `protocol` field to the `status` reply would be a minor change.

Any change to what the daemon accepts or sends updates this document in the same
commit.

## 1. The local socket

- **Path:** `$HEYMORGAN_SOCKET` if set, otherwise
  `$XDG_RUNTIME_DIR/heymorgan.sock` (`/tmp/heymorgan.sock` with no
  `XDG_RUNTIME_DIR`). On a server (§5) `HEYMORGAN_SOCKET` defaults to
  `data/heymorgan.sock` in the checkout instead.
- **The old path, deprecated:** with no `HEYMORGAN_SOCKET` set, the daemon also
  listens on `$XDG_RUNTIME_DIR/heyclaude.sock`, with the same handler, for
  clients written before the rename. A client tries `heymorgan.sock` and may
  fall back to `heyclaude.sock` (a daemon older than 1.1 has only that one).
  Dropping the old path will be protocol 2.0.
- **Who may connect:** anyone who can open the socket. There is no
  authentication; the socket relies on `$XDG_RUNTIME_DIR` being private to the
  user (mode 0700). Whatever can reach it can do everything below, including
  changing settings and adding MCP servers that run commands.
- **Lifetime:** the daemon deletes and recreates the socket when it starts and
  deletes it when it gets SIGINT or SIGTERM. A client that finds no socket, or
  gets `ECONNREFUSED`/`ENOENT`, should treat Morgan as not running and try again
  later (the user unit restarts it within 5 seconds).

### Framing

**One command per connection.** The client connects, writes one line of UTF-8
ending in `\n`, and reads. The daemon reads up to the first `\n`, ignores
anything after it, and:

- for every command but `watch`, writes **one line of JSON** followed by `\n`
  and closes the connection;
- for `watch`, keeps the connection open and writes one JSON event per line
  until the client disconnects (§3).

A command is a word, a single space, and its arguments:
`line.trim().split(" ")`, so the command is everything before the first space,
and commands that take text take everything after it, rejoined with single
spaces (runs of spaces survive). **A line cannot carry a newline**: text with
line breaks has to go through `ask`, whose JSON can escape them.

## 2. Commands

Every reply is a JSON object with `ok: true` or `ok: false`. When `ok` is false
there is an `error` string, meant to be shown to the user as it is. An unknown
command answers `{ "ok": false, "error": "unknown command: <name>" }`. A command
that throws answers `{ "ok": false, "error": <message> }`; it never takes the
daemon down.

`state` in a reply is the daemon's state **after** the command was taken in, and
is often stale by the time it is read; follow `watch` for the real thing. States
are `idle`, `listening`, `transcribing`, `thinking`, `consulting`, `speaking`.

Most commands that start or stop something answer at once; what follows comes
as events on `watch`.

### Turns

| Command | Does | Reply |
|---|---|---|
| `toggle` | Not listening: start listening (as if the wake word had been heard). Listening with something heard: send it as a spoken turn. Listening with nothing heard: stop listening. | `{ ok, state }` |
| `say <text>` | A turn as if spoken: answered aloud (if speech is on) as well as in text. Stops listening first. | `{ ok, state }` |
| `type <text>` | A turn as if typed: answered in text only, in markdown. Stops listening first. | `{ ok, state }` |
| `ask <json>` | A typed turn with files. See below. | `{ ok, state }`, or `{ ok: false, error: "ask wants JSON: { text, files }" }` |
| `speak <text>` | Say the text aloud, as Morgan, without a turn. Nothing happens if speech output is off. Not recorded. | `{ ok, state }` |
| `interrupt` | Cut off whatever is in flight (speech, the model's answer, a consultation) and go idle. Nothing proposed is dropped. For a satellite that hears the user start talking again. | `{ ok, state }` |
| `stop` | As `interrupt`, and also: stop listening, cancel a voice being taught, drop anything Morgan proposed and is waiting for a yes on. Emits `dismiss`. | `{ ok, state }` |
| `new` | End the conversation in hand (it is filed) and start a fresh one. Emits `new`. | `{ ok, state }` |
| `interview` | Start a fresh conversation and the orientation interview. Emits `interview` `{ active: true }`. | `{ ok, state }` |
| `continue <id>` | Carry an earlier conversation on: start a fresh one with the earlier one's exchanges in front of Morgan. `id` comes from `days` or `conversation`. Emits `continuing`. | `{ ok }`, or `{ ok: false, error: "no such conversation" }` |

`ask` takes one line of JSON:

```json
{ "text": "What does this say?", "files": ["/home/jeff/a.pdf"], "attached": [{ "name": "b.txt", "content": "…" }] }
```

- `files` are paths **on the machine the daemon runs on**, read by the daemon.
  A server ignores them (it cannot read the client's disk).
- `attached` are files already read, by name and content. This is how a client
  daemon hands its files to a server; any client may use it.
- With no `text` and some files, the text becomes "Here is a file." or "Here
  are some files."

**Note:** the error message names only `{ text, files }`, but `attached` is
accepted too.

**Note:** a turn that starts with "that's wrong", "scratch that" and the like
strikes the last answer first, exactly as `rate <t> down` (§2, Memory and
record) would. This applies to `say`, `type` and `ask` alike.

**Note:** spoken turns that are only a goodbye ("thanks, bye") are not sent to
the model: they are answered with a short farewell (a `sentence` event, then
speech), or with silence for "stop" or "quiet". This applies to turns heard by
the microphone, not to `say`.

### The record

Exchanges are identified by `t`, a millisecond timestamp: the moment the answer
was **filed**, not when the question was asked (that is `asked`). Every
`filed`, `rated` and `review` event, and every `rate` and `settle` command,
uses this `t`.

| Command | Reply |
|---|---|
| `recent [n]` | `{ ok, items: [exchange…] }`: the last `n` exchanges (default 50, at most 500), oldest first, hidden ones included. |
| `days [YYYY-MM]` | The month's conversations, for a calendar (default: this month). `{ ok, key: "YYYY-MM", name: "October 2026", first, length, today, days }`: `first` is the weekday of the 1st (0 is Sunday), `length` the number of days, `today` is `YYYY-MM-DD`, and `days` maps `YYYY-MM-DD` to `[{ id, t0, t1, title, exchanges, clock }]`, earliest first. A malformed month: `{ ok: false, error: "days wants a month: YYYY-MM" }`. |
| `search <text>` | `{ ok, query, results: [{ id, t0, title, summary, when, score, said }] }`: up to eight past conversations, best first, ranked by meaning (the query embedded on the server, with the exchanges' own model) plus a little for shared words; none scoring under 0.5. `said` is what you said in the exchange that bears on it most. `id` is for `conversation <id>`. On a client it is answered by the server. |
| `conversation <id>` | `{ ok, id, t0, title, when, items: [exchange…], earlier, later, similar }`. `earlier` are conversations this one carried on from, `later` those that carried it on, `similar` up to 50 others by likeness (each with a `score`); all three are `[{ id, t0, title, when }]`. `{ ok: false, error: "no such conversation" }` if there is none. |
| `threads` | `{ ok, threads: [{ id, t0, t1, title, summary, exchanges, ts, live }] }`: every thread the transcript has been cut into, as stored. `id` is for `conversation <id>`; `ts` are its exchanges' `t`. A thread's id is its first exchange's `t`, a dash and a number; when two threads are merged one id goes, and the thread kept holds its exchanges — so an id that has gone is found again as the thread whose `ts` holds the number before its dash. |
| `log [n]` | `{ ok, lines: [{ t, level, text }] }`: the last `n` lines Morgan logged (default 100; at most 500 are kept). `level` is `info`, `warn` or `error`, guessed from the wording. |
| `tools` | `{ ok, calls: [{ t, name, args, result }] }`: MCP tool calls since the daemon started, `result` cut to 400 characters. |

An **exchange**, as `recent` and `conversation` give it:

```json
{
  "t": 1761220000000, "asked": 1761219990000,
  "when": "3:14 PM", "askedWhen": "3:14 PM",
  "user": "…", "morgan": "…",
  "oracle": "…",
  "steps": [event…],
  "hidden": false, "good": false,
  "review": [{ "topic": "…", "note": "…" }]
}
```

`oracle` is present only when the Oracle was consulted, `steps` only when there
were steps (the `consult`, `tool`, `result`, `recall`, `look`, `memory`,
`confirm` and `reminder` events of that turn, as they were emitted, at most 40,
long texts cut to 2000 characters), `review` only when `hidden` is true.
`when` and `askedWhen` are formatted for an en-US reader: the time today, or the
date and time before today.

**Note:** conversation ids are of two kinds: a thread's own id, or `u<t>` for
talk not yet cut into threads, made from the first exchange's `t`. A `u…` id
stops working once that talk is cut into threads (which happens when a
conversation ends). Do not store ids for long.

**Note:** `days` and `conversation` leave out hidden exchanges (and a
conversation that was nothing else); `recent` and `threads` do not.

### Memory and the record's verdicts

| Command | Does | Reply |
|---|---|---|
| `rate <t> up\|down\|none` | Thumbs up marks an answer as one to prefer; thumbs down hides it from Morgan for good (it stays on the record, but is taken out of the conversation in hand, out of search, and out of any thread, which is made again without it). Anything but `up` or `down` clears both. Emits `rated`, and after `down` also `review`. | `{ ok }`, or `{ ok: false, error: "there is no such exchange" }` |
| `settle <json>` | The user's verdict on a note in memory that may have come from a hidden answer: `{ "t": …, "topic": "…", "note": "…", "action": "delete" \| "keep" }`. Anything but `delete` keeps it. Emits `review` for that `t` with what is left. | `{ ok }` |

### Voices heard

| Command | Does | Reply |
|---|---|---|
| `voices` | — | `{ ok, installed, where, enrolled: [name…], prints: [{ name, t, own }], only, threshold, checks: [{ t, seconds, name, score, need, ok }] }`. `where` (1.11) is `brain` when the brain checks this device's voices, `here` when the device does; `own` marks a voice taught for this device only, used here in place of the shared one. `only` is whether voices not taught are ignored; `checks` the last 30 voice checks. |
| `enroll <name> [--here \| --everywhere] [--aloud] [--device <device>]` | Teach a voice: the next six things said (each at least 1.5 s) are taken as samples, then the voiceprint is saved. Starts listening. Emits `enroll` as it goes, and `{ type: "enroll", name, saved }` at the end (`shared`, `device` or `here`). With the brain checking voices (1.11), a voice not yet taught anywhere is kept for every device; one taught already is kept as this device's own; `--here` keeps it as this device's own regardless, `--everywhere` replaces the shared one. `--aloud`: Morgan says each line for its person to repeat. `--device`: started on that device, which says the lines (one with no screen). | `{ ok, state }`, or `{ ok: false, error }` when the voice model is not installed where the device's speech is done, the brain cannot be reached, or no name was given |
| `forget-voice <name> [--everywhere]` | Delete a voiceprint: this device's own if it has one (the shared one is then used here again), otherwise the shared one; `--everywhere`, both. | As `voices` |
| `mute [on\|off]` | This device's microphone (1.11), as a speaker's button held down does; no argument flips it. A muted device does not listen, and is not weighed when other devices hear the wake word. Emits `muted`. | `{ ok, muted }` |

### Reminders, status, settings

| Command | Reply |
|---|---|
| `reminders` | `{ ok, now, reminders: [{ id, at, text, made, when }] }`, soonest first. `now` (1.10) is the answering machine's clock, which `at` and `made` are on: time left is `at - now`, not `at` less a client's own clock. `text` is empty for a bare timer; `when` is a phrase such as "at 3:15 PM today (in 20 minutes)". |
| `status` | `{ ok, state, name, model, oracle, stt, tts, wakeWord, wakeEngine, voice, engine, interviewing, mcpTools: [name…], topics: [name…] }`. `name` is Morgan's name; `model` and `oracle` the chat model's and the Oracle's; `stt` and `tts` whether speech in and out are configured; `wakeWord` the phrase or `null`; `wakeEngine` is `spotter` or `transcribe`; `engine` is `kokoro` or `piper`, and `voice` that engine's voice. `speech` (1.11) is where this machine's speech is done: `brain`, `here`, or, for a brain, `service` (a speech service does it). `muted` (1.11) is the device's microphone. A device daemon adds `role: "client"`, `server` and `device`, and answers `stt`, `tts`, `voice` and `engine` from what its brain offers when the brain does its speech, `wakeWord` and `wakeEngine` for itself (§5). |
| `describe <json>` | `{ "image": "<base64>", "question"?: "…" }`: the picture described by the model that looks — what it is, what it shows, any text in it word for word. Or `{ "text": "…", "name"?: "…", "what"?: "file" \| "project" }`: a file's words described in two or three sentences by the chat model — what it is and what it is about; with `"what": "project"`, a project's tasks, done and to do, described as what the project is for and covers (1.9). Nothing is said, kept, remembered or recorded. A client hands it to the server. | `{ ok, text, model, what }` (`what` from 1.9), or `{ ok: false, error }` |
| `admin <json>` | `{ "op": "…", "args": { … } }`: see §4. |
| `access add <device>` \| `access list` \| `access remove <device>` | On a brain (§6); a device forwards it to its brain. (`devices.*`, §4, says the same with whether each is connected.) `add`: `{ ok, name, key }`, the key shown this once. `list`: `{ ok, keys: [{ name, made, used }] }`. `remove`: `{ ok }`, or `{ ok: false, error: "no key for <device>" }`; a removed key's connection is closed at once. Anywhere else: `{ ok: false, error: "only a server issues access keys" }`. |
| `watch` | No reply: the connection becomes an event stream (§3). |

## 3. Events (`watch`)

The first line is always `{ "type": "state", "state": …, "name": … }`, the
current state and Morgan's name. After that, one JSON object per line, as things
happen, to every connection that is watching. There is no replay: an event
missed while not connected is gone (use `recent` to catch up on the record).

| `type` | Fields | When |
|---|---|---|
| `state` | `state`, `typed` | The state changed. `typed` is true while a typed turn is being worked on (so the voice popup can stay shut); it is never true for `listening` or `transcribing`. The first event on a connection also has `name` and no `typed`. |
| `wake` | — | The wake word or the interrupt word was heard. |
| `level` | `who`: `user` \| `morgan`, `value`: 0–1 | The loudness of the microphone while listening (every other block of audio), or of Morgan's voice while speaking (every 50 ms, timed to the playback). A `morgan` value of 0 marks the end of Morgan's speech. |
| `voice` | `name` (or `null`), `score` | A voice check, when only known voices are listened to: whose voice it was, and whether it passed (`name` is `null` if not). |
| `enroll` | `name`, then `count` and `want`, or `cancelled: true`, or `saved` (1.11: `shared`, `device` or `here`) | A sample of a voice being taught was taken, the teaching was stopped, or the voice was kept. |
| `muted` | `on` (1.11) | The device's microphone was muted or unmuted (its button, or `mute`). |
| `user` | `text`, `at`, `when` | What the user said or typed, as Morgan took it. Attached files are listed after the text, each on a line starting "📎 ". |
| `kind` | `kind`, and any of `follows`, `lookup`, `sum`, `oracle`, `change`, `reminder`, `keep`, `look`, `earlier`, `files` that are true | How the turn was sorted. Diagnostic; not meant for display. |
| `partial` | `text` | The answer so far, as the model writes it, at most every 120 ms. Each replaces the last; it is not a delta. |
| `sentence` | `text` | One finished sentence of the answer, markdown stripped, as it is spoken (or would be). Speaking clients speak these. |
| `assistant` | `text`, `at`, `when` | Morgan's whole answer, once written. Also a reminder going off, and the farewell to a struck answer. |
| `filed` | `t` | The exchange was filed under `t`, and can now be rated. |
| `consult` | `question`, `quick` (sometimes) | Morgan asked the Oracle. `quick: true` is the short consultation; without it, the full one (which looks things up, and takes longer). |
| `oracle` | `text` | The Oracle's answer. |
| `tool` | `name`, `args` (absent for the Oracle's own tools) | A tool was called: an MCP tool, `calculate`, or a tool the Oracle used. |
| `result` | `text` | What a tool that changes nothing gave back, cut to 4000 characters. |
| `look` | `source`: `screen` \| `clipboard` \| `camera` (or a source name from settings) | Morgan looked. |
| `recall` | `topic`, `body` | Morgan read a memory topic, or searched earlier conversations (`topic` then starts "earlier talk"). |
| `memory` | `topic`, `note`; or `topic`, `note`, `corrected: true`; or `topic`, `note`, `removed: true`; or `topic`, `rewritten: true`, `notes`, `body` | A note was kept, corrected in place, taken out, or a topic reorganized. A document or picture kept is a `memory` event under the topic `Documents` or `Pictures`. |
| `confirm` | `name`, `args`; later `name`, `done: true \| false` | A change was proposed (and waits for a yes); then carried out (`done: true`) or dropped (`done: false`). A change agreed to in advance comes as both at once. |
| `reminder` | `set: true`, `text`, `when` | A reminder or timer was set or changed. |
| `reminder` | `cancelled: true`, `id`, `text` (1.10) | A reminder or timer was cancelled, by voice or by `reminders.cancel`. One without `set` or `cancelled` is one going off. |
| `reminder` | `text`, `late` | A reminder went off. An `assistant` event and speech follow. |
| `rated` | `t`, `vote` | An exchange was rated (`vote` as sent: `up`, `down` or anything else for none). |
| `review` | `t`, `notes: [{ topic, note }]` | Notes in memory that may have come from a hidden exchange, for the user to keep or delete with `settle`. Sent after a thumbs down and after each `settle`. |
| `dismiss` | — | `stop` was asked: whatever a face is showing for the turn can go. |
| `new` | — | A fresh conversation began (`new`). |
| `interview` | `active` | The orientation interview began or ended. |
| `continuing` | `id`, `title` | An earlier conversation is being carried on (`continue`). |
| `error` | `message` | Something went wrong that the user should see. |

**Note:** settings changes are **not** an event on the local socket. A face that
shows settings has to ask again (`admin` `config.get`). The `config` message
exists only on the server link (§6), and is not an event (it has no `type`).

**Note:** the order within a turn is usually `user`, `state` thinking, `kind`,
steps, `partial`…, `sentence`…, `assistant`, `filed`, then `state` speaking and
`state` idle; but sentences start before `assistant`, and a turn that is
interrupted stops wherever it is, without `assistant` or `filed`.

## 4. Admin operations

`admin {"op": "<op>", "args": {…}}`. The reply is `{ ok: true, …fields }` or
`{ ok: false, error }`; an unknown op answers `{ ok: false, error: "unknown: <op>" }`
and malformed JSON `{ ok: false, error: "admin wants JSON: { op, args }" }`.
`args` may be left out where an op takes none.

### Settings

| Op | Args | Reply fields |
|---|---|---|
| `config.get` | — | `name, userName, style, ollama: { url, model }, embedModel, oracleModel, wakeWord, interruptWord, followUpSeconds, endSilenceMs, hotkey, sight, folders, knownVoicesOnly, voiceThreshold, similarFloor, timeZone` |
| `config.set` | `values`: `{ "path.to.key": value }` | `restart`: whether the daemon will restart to take the change up |

`config.set` writes `config.json`. A key path may be dotted (`"ollama.url"`). A
value of `null` puts a setting back to its default, except for `wakeWord`,
`interruptWord`, `hotkey` and `userName`, where `null` (or `""`) switches it off.
Settings Morgan reads each time it uses them (`similarFloor`, `knownVoicesOnly`,
`voiceThreshold`, `userName`, `folders`, `sight`, `pronunciations`, `style`,
`followUpSeconds`, `endSilenceMs`, `recallScore`, `consultLine`, `wakeReply`,
`timeZone`) take effect at once. **Any other key restarts the daemon** about 400 ms after
the reply (the watch connection drops and the socket goes away for a moment).
`config.set` does not check keys or values: anything is written.

`timeZone` is an IANA name (`"America/New_York"`); `null` is the zone of the
machine the daemon runs on, and `config.get` then reports that zone. A name
that is not a time zone is written but not used: the daemon keeps the zone it
had. On a client the server's setting is the one that counts.

### Where Morgan lives

| Op | Args | Reply fields |
|---|---|---|
| `client.get` | — | `role`, `server`, `device`, `hasKey`, `connected`, `brainHere`, `housed` |
| `client.set` | `here: true`, or `server`, `key`; and `device` | `restart: true` |

`brainHere` (1.11) is whether this device's brain is on this machine (its
`server` is `localhost`, `127.0.0.1`, `::1` or this machine's name), or this is
the brain. `housed`: this is a brain kept in its checkout (the home server).

`client.set` with `here: true` (or, as before 1.11, an empty `server`) puts the
brain on this machine, as `heymorgan serve` does: heymorgan-brain installed
and started, a key made for this device, and `client.json` pointed at
`localhost:8790`. With a `server`, it writes `client.json`, keeping the old key
if none is given, and stops a brain this machine kept for itself. A key must
start `hc_`. It always restarts the daemon.

### Devices (1.11)

Asked of the brain, wherever it is; a device forwards them.

| Op | Args | Reply fields |
|---|---|---|
| `devices.list` | — | `listen` (`local`: only devices on the brain's own machine; `network`), `housed`, `devices: [{ name, made, used, connected, kind, can, ownVoices: [name…], hearsPoorly }]` — one per key |
| `devices.add` | `name` | `name`, `key`, shown this once |
| `devices.remove` | `name` | — (its connection is closed at once) |

`hearsPoorly` is set once a device's longer speech in a voice it knows keeps
scoring close to the bar: teach that voice again there (`enroll --here --device`).
A brain in a laptop's session lets in only that laptop's devices until
`listen` is set to `network` (a `config.set`, which restarts the brain); a brain
kept in its checkout goes by `HOST` in its `.env`.

### Memory

| Op | Args | Reply fields |
|---|---|---|
| `memory.list` | — | `topics: [{ name, description, notes }]`, `documents: [{ title, source, t, size }]`, `pictures: [{ label, note, t }]` |
| `memory.note.add` | `topic`, `text` | — |
| `memory.note.set` | `topic`, `index`, `text` | — |
| `memory.note.delete` | `topic`, `index` | — |
| `memory.note.move` | `topic`, `index`, `to` | — |
| `memory.topic.add` | `name`, `description` | — |
| `memory.topic.rename` | `topic`, `name`, `description` | — |
| `memory.topic.delete` | `topic` | — |
| `memory.document.get` | `title` | `title, source, t, text` (the first 20,000 characters), `more` (characters left out) |
| `memory.document.delete` | `title` | — |
| `memory.picture.view` | `label` | `path`: a JPEG written to `$XDG_RUNTIME_DIR`, deleted after two minutes; `data`: the same picture, base64 |
| `memory.picture.delete` | `label` | — |
| `vision.check` | — | `chat`, `chatSees`, `vision`, `chosen`, `visionSees`: the chat model and the one that looks, each `true`/`false` for whether it takes pictures (Ollama's `capabilities`), `null` if the server could not say |
| `memory.hold` | `on` (default true), `hours` (default 12, at most 24) | `held`, `until`: nothing new is remembered until then, or until `on: false`. Held only in memory: a restart lets go |
| `memory.hold.get` | — | `held`, `until` |
| `memory.garden.report` | — | `days`: what the gardener changed, day by day |
| `memory.garden.run` | — | `changes`, `days`: tidy memory now. Can take minutes. |
| `memory.garden.undo` | `id` | whatever the undo returns |

Notes are addressed by their position (`index`) in the topic as `memory.list`
last gave it. **Note:** nothing guards against the list having changed since;
a note added or removed in between shifts the indexes.

Memory ops emit no events.

### Reminders, the log

| Op | Args | Reply fields |
|---|---|---|
| `reminders.list` | — | `reminders`, as the `reminders` command |
| `reminders.cancel` | `id` | `reminders`, what is left |
| `log.recent` | `count` (default 200, at most 500) | `lines: [{ t, level, text, at }]`, `at` being the time of day |

### Voice out and voices heard

| Op | Args | Reply fields |
|---|---|---|
| `voice.list` | — | `kokoroInstalled, engine, kokoroVoice, kokoroSpeed, piperVoice, kokoro: [name…], piper: [name…]`: the voices where this device's speech is made (the brain's, when it makes it) |
| `voice.preview` | `engine`: `kokoro` \| other, `voice` | — (made where this device's speech is made, played on this device's speaker) |
| `voices.status` | — | as the `voices` command |
| `voices.enroll` | `name`, `scope` (`auto` \| `device` \| `everywhere`), `device`, `aloud` | — (as `enroll`) |
| `voices.forget` | `name`, `scope` (`auto` \| `device` \| `everywhere`) | as `voices.status` |

Switching voice is a `config.set` of `engine`, `kokoroVoice` or `voice`, which
restarts the daemon.

### Connections

| Op | Args | Reply fields |
|---|---|---|
| `ollama.models` | `url` (default the configured one) | `chat: [{ name, gb }]`, `embedding: [{ name, gb }]` |
| `oracle.account` | — | `loggedIn, email, plan`, and `error` if `claude` did not answer |
| `mcp.list` | — | `servers: [{ name, target, allow, hasKey, connected, error, tools: [{ name, readOnly, mode, on }] }]`; `mode` is `allow`, `ask` or `off`, and `on` is `mode` not `off` |
| `mcp.add` | `name`, and `url` (and `key`) or `command` | as `mcp.list` |
| `mcp.remove` | `name` | as `mcp.list` |
| `mcp.allow` | `name`, `allow`: `all` \| other | as `mcp.list` |
| `mcp.tool` | `name`, `tool`, and `mode` (`allow` \| `ask` \| `off`) or `on` | as `mcp.list` |
| `mcp.reconnect` | — | as `mcp.list` |
| `client.mcp.list` | — | `{ role, servers: [{ name, target, allow, connected, error, tools: [{ name, readOnly, mode }] }] }`: this machine's own servers (`client.json`), every tool they offer, off ones too |
| `client.mcp.add` | `name`, and `url` (and `key`) or `command` | as `client.mcp.list` |
| `client.mcp.remove` | `name` | as `client.mcp.list` |
| `client.mcp.allow` | `name`, `allow`: `all` \| other | as `client.mcp.list` |
| `client.mcp.tool` | `name`, `tool`, `mode` | as `client.mcp.list` |

**A tool's mode.** Set by name it wins; otherwise a tool that reads is
`allow`, and one that changes something is `ask` when its server's `allow` is
`all` and `off` when not. A choice that only repeats that is not kept. Only
`ask` tools wait for the user's yes; an `allow` tool that changes something is
done when the model calls it. The `client.mcp.*` ops are answered by the
daemon whose socket they reach, whatever its role: on a client they change
what it offers the server, which is told at once.

**Note:** `mcp.add` with `command` starts that command on the daemon's machine.
Anything that can send `admin` can run programs as the user.

## 5. Brain and device

Every Morgan has a **brain** — memory, the model, the Oracle, reminders, the
voices it knows, and speech for its devices — and one or more **devices**: the
microphone, the wake word, the speaker, and a screen, folders or tools it may
offer. A face always talks to its machine's device daemon. The device reaches
its brain over the server link (§6) at an address, with a key, whether the
brain is the home server or the same laptop: **only the address differs**.
Wherever a brain runs it is a server, for however many devices it has, one or
ten.

A laptop with its own brain runs both, as two user services:
`heymorgan-brain` (the brain, `HEYMORGAN_ROLE=server`, `PORT=8790`, socket
`$XDG_RUNTIME_DIR/heymorgan-brain.sock`, this account's usual folders and
login keyring) and `heymorgan` (the device, a client of `localhost:8790`).
`heymorgan serve` (or `client.set` with `here: true`) sets that up. The home
server runs only a brain, kept in its checkout. A Pi runs only a device.

`env.mjs` settles which part a daemon plays before anything else runs:

1. `HEYMORGAN_ROLE` (`local`, `server` or `client`), if set;
2. otherwise `server` if `PORT` is set, which it is when the checkout has a
   `.env` (read by `env.mjs` itself, without overriding the real environment):
   a brain **housed** in its checkout, with its data in `data/`;
3. otherwise `client` (a device) if `client.json` names a `server`;
4. otherwise `local`: the whole of Morgan in one process, as before there were
   devices. Kept for trials (`tests/trial.sh`). A `local` daemon started by its
   service sets itself up as brain and device (as `heymorgan serve`) and starts
   again as the device.

`client.json` is `$HEYMORGAN_CLIENT_FILE`, by default
`~/.config/heymorgan/client.json`:

```json
{ "server": "localhost:8790", "key": "hc_…", "device": "laptop" }
```

`server` is `host:port` (taken as `ws://`), `ws://…`/`wss://…`, or
`http://…`/`https://…` (turned into `ws://`/`wss://`, path kept, for a reverse
proxy). `device` defaults to the hostname. `kind` may be given too (default
`laptop`). `settings` holds the device's own settings, over the brain's
(`heymorgan device`). It is written by `heymorgan serve`, `heymorgan
connect` and `admin` `client.set`.

**What a face sees does not change with the role.** It talks to the same local
socket, with the same commands and events. The difference is who answers:

**local** — the whole of Morgan in one process. Everything above.

**client** (a device) — this machine's daemon has the microphone, the wake
word and the speaker; its brain has everything else, and does its speech
unless the device does its own (below). On the local socket:

- Answered here: `toggle`, `speak`, `watch`, `voices`, `enroll` (but
  `enroll … --device`), `forget-voice`, `mute`, and `admin` ops whose name
  starts `voices.` or `client.`, and `voice.preview`; `voice.list` too when
  this device makes its own speech.
- Everything else is forwarded to the server, and the server's reply is passed
  back as it is, with three changes: `status` gains `role: "client"` and
  `server`, and this machine's own `stt`, `tts`, `wakeWord`, `wakeEngine`,
  `voice` and `engine`; `memory.picture.view` gets a `path` on this machine (the
  picture written here) in place of `data`; and `ask` has its `files` read here
  and sent as `attached`.
- Before forwarding, `stop` also stops listening and speaking here, and `say`
  and `type` stop listening here.
- A forwarded command waits 45 seconds for the server (`admin`, 5 minutes).
  If the server cannot be reached or does not answer in time, the reply is
  `{ ok: false, error: "I can't reach the server." }` (or "…took too long…",
  or "Lost the connection to the server."), and for `say` Morgan also says
  "I can't reach home right now."
- Events: the client's own (`level` for its microphone and voice, `wake`,
  `voice`, `enroll`, `state` while listening and speaking) and the server's
  events, passed on as they come, except the server's `level`, which is
  dropped. The client speaks the server's `sentence` events for turns spoken
  here, and for reminders going off. `state` follows the server's, except
  while the client is itself speaking, and it is not set back to idle while the
  client is listening.
- Settings are the server's: the client keeps a copy in
  `~/.config/heymorgan/mirror.json` (`$HEYMORGAN_MIRROR`), updated from the
  server, and restarts itself when a setting it cannot take up live changes.
  `config.json` on the client is left alone, for when it runs locally again.

**Note:** `interrupt` sent to a client's socket is forwarded to the server and
does **not** stop speech already playing on the client; `stop` does both. A
face on a client that wants speech to stop at once should send `stop`.

**Note:** voice settings (`engine`, `kokoroVoice`, `voice`) are set with
`config.set`, which a client forwards: the choice is saved on the brain and
mirrored back to every device, and the brain speaks in it.

**Where a device's speech is done** (1.11) is its `speech` setting: `brain`,
`here`, or `auto` (the default): the brain's, for whatever the brain offers
in its welcome (`stt`, `tts`, `voiceprints`), and this device's own for
whatever it does not (a brain with no speech installed). Done by the brain,
the device needs no Whisper, Piper, Kokoro or voice model at all; a device
that has them uses them, too, while its brain cannot be reached. A device with
no voice of its own says "I can't reach home right now" in the brain's voice,
kept for that (`cant-reach.json` beside `client.json`), or two falling tones
if it has never heard it.

**A device's lights and button** (1.11): the `lights` setting is a command
the device starts and keeps running. It is told the state, one word a line
(`idle`, `listening`, `transcribing`, `thinking`, `consulting`, `speaking`,
`muted`, `offline`), and says `press` or `hold` on its stdout: a press starts
listening or stops an answer, a hold mutes or unmutes the microphone.
`pi/lights.py` is one for the Voice Bonnet.

**Note:** `access` is forwarded too, so any client — anything holding a key —
can issue and revoke keys, including its own.

**server** (a brain) — no microphone, speaker, screen or desktop of its own.
**Housed** in its checkout (the home server), it keeps everything in `data/`
(`$HEYMORGAN_DATA`): `config.json`, `memory/`, the memory key in `memory.key`
(there is no keyring), `access.json`, and its command socket `heymorgan.sock`.
In someone's session (a laptop's own brain), it keeps that account's usual
folders and login keyring, with `access.json` in `~/.config/heymorgan/` and
its command socket at `$XDG_RUNTIME_DIR/heymorgan-brain.sock` (`heymorgan brain
<command>`). It answers its local socket as a local daemon would, and its
devices over the server link (§6). `toggle` and `speak` do nothing useful
there; `enroll --device` starts teaching on a device. Its answers go out as
`sentence` events; the device that asked asks the brain for each as sound.

It does its devices' speech with this machine's whisper.cpp, Kokoro or Piper,
and voice model (`stt`, `tts`, `engine`, the brain's own settings); or, with
`speechUrl` (and `speechKey`) set, asks a speech service — `node speech.mjs
serve` on another machine, such as the AI server beside Ollama — which does
the same over HTTP (`POST /transcribe`, `/speak`, `/embed`, `GET /status`,
each with `Authorization: Bearer <SPEECH_KEY>`). The voices it knows stay on
the brain either way: the service only turns speech into a voiceprint.

## 6. The server link

A brain listens for WebSockets on `PORT` (8790 by convention) at `HOST`:
by default `0.0.0.0` for a brain housed in its checkout, and `127.0.0.1` for a
brain in a laptop's session unless its `listen` setting is `network`. Any
path, messages up to 32 MB. Every message is a
JSON text frame; binary frames are ignored. Behind a reverse proxy the path
prefix is the proxy's to strip (see `docs/server-and-satellites.md`).

**Opening.** Within 5 seconds the client sends:

```json
{ "hello": { "key": "hc_…", "device": "kitchen-dot", "kind": "dot", "can": ["sight:camera", "files"] } }
```

- `key` must be one the server issued (`heymorgan access add <device>`). The
  server keeps only its SHA-256 hash, in `data/access.json`. A bad key gets
  `{ "error": "That key is not one this server issued." }` and close code
  `4003`; no hello in 5 seconds, close code `4001`.
- The **device name is the key's**, not the `device` the client sends (which is
  ignored by the server). `kind` is free text, default `client`.
- `can` lists what the device can do for the server: `sight:<source>` for each
  source it may look through (`screen`, `clipboard`, `camera`, …), `files`
  if it has folders Morgan may read, and `mcp` if it runs MCP servers of its
  own. It may be sent again later on its own: `{ "can": [ … ] }`.
- `tools` (optional) lists the tools of the device's own MCP servers, each
  with its `mode` (1.5; one without is `allow` if it reads, `ask` if not) —
  `[{ server, tools: [{ name, description, inputSchema, annotations, mode }] }]` —
  only those its `client.json` allows (see *A client's own MCP servers*). Sent
  again with `can` when they change: `{ "can": [ … ], "tools": [ … ] }`.

The server answers:

```json
{ "welcome": { "name": "Morgan", "state": "idle", "config": { … },
  "speech": { "stt": true, "tts": true, "voiceprints": true, "engine": "kokoro", "voice": "af_heart", "rate": 24000, "enrolled": ["Jeff"] } } }
```

`config` is the brain's saved settings without the ones that are commands or
secrets (`LOCAL_ONLY` in `admin.mjs`). `speech` (1.11) is what the brain can do
for this device's speech, and the voices it knows for this device; it is sent
again as `{ "speechOffer": { … } }` whenever that changes (Kokoro still
loading when the device connected, a speech service coming back). A brain
from before 1.11 sends no `speech`, and a device then does its own.

`can` gains `voice` (1.11) for a device that listens for the wake word and is
not muted: those are the devices weighed against each other when more than
one hears it.

**After the welcome**, from client to server:

| Message | Means |
|---|---|
| `{ "id": 7, "command": "type What time is it" }` | A command, exactly as a line on the local socket (§2), without the `\n`. `watch` is ignored. |
| `{ "abilityResult": { "id": 3, "result": … } }` or `{ "abilityResult": { "id": 3, "error": "…" } }` | The answer to an ability request. |
| `{ "can": [ … ] }` | What the device can do has changed. |
| `{ "speech": { "id": 4, "op": "…", "args": { … } } }` | Speech asked of the brain (1.11); answered by `speechResult`. |

From server to client:

| Message | Means |
|---|---|
| `{ "id": 7, "reply": { "ok": true, … } }` | The reply to command 7. Commands are answered in whatever order they finish. |
| `{ "type": "…", … }` | Every event, exactly as on `watch` (§3), to every connected client, from the moment of the welcome. |
| `{ "config": { … } }` | The saved settings changed (same filtering as in `welcome`). |
| `{ "ability": { "id": 3, "name": "…", "args": { … } } }` | Something only the device can do. Answer with `abilityResult` within 60 seconds, or the turn goes on without it. |
| `{ "speechResult": { "id": 4, "result": { … } } }` or `{ "speechResult": { "id": 4, "error": "…" } }` | The answer to a `speech` request. |
| `{ "speechOffer": { … } }` | What the brain offers for speech changed (as `welcome.speech`). |

Speech, asked of the brain (1.11). Sound is 16 kHz 16-bit mono PCM, base64, in;
16-bit mono at `rate`, base64, out.

| `op` | `args` | `result` |
|---|---|---|
| `transcribe` | `pcm`, `prompt` (words to expect: the wake phrase, Morgan's name, `sttPrompt`) | `{ text }` |
| `speak` | `text`, and optionally `engine` and `voice` (a preview) | `{ pcm, rate }` |
| `whose` | `pcm`, `threshold` (the device's own bar) | `{ name, score }`: the voice, of those this device answers to, most like it. Deciding whether it passes is the device's. |
| `teach` | `name`, `samples: [pcm…]`, `scope` (`auto` \| `device` \| `everywhere`) | `{ saved: "shared" \| "device", enrolled }`. `auto`: shared if no device has taught that voice, else this device's own. |
| `seed` | `name`, `vectors` | `{ enrolled }`: a voice taught on this device before its brain did its speech, kept for every device unless the brain has one of that name. A device sends its own on connecting. |
| `forget` | `name`, `scope` | `{ enrolled }` |
| `voices` | — | `{ installed, enrolled, prints: [{ name, t, own }] }` |
| `wake` | `score`: how far the wake word stood above the room's noise, as the device heard it | `{ go }`. With more than one device that can hear it, the brain waits 300 ms for others that heard it, and only the one with the highest score is told `go: true`; one heard within 2 seconds after a device was chosen is told `go: false` at once. A device that cannot reach the brain, or gets no answer in 1.5 seconds, goes ahead. |

Abilities:

| `name` | `args` | `result` |
|---|---|---|
| `capture` | `source`, and whatever else the source takes | `{ text }` for the clipboard's text, otherwise `{ data }`, a base64 image |
| `files` | `name` (a file tool's name), `args` | the tool's text result |
| `allowed` | `path` | the real path, if it is inside a folder Morgan may read, otherwise `null` |
| `find` | `hint` | files matching the words |
| `read` | `path`, `question` | the file's contents, or the part that answers the question |
| `mcp` | `server`, `tool`, `arguments` | the text the device's MCP server gave back |
| `enroll` | `name`, `scope` | `"started"`: the device teaches that voice, saying each line for its person to repeat (1.11) |

`capture` goes only to the device the turn came from (the one that last sent
`say`, `type`, `ask` or `continue`); if that one cannot look at that source, the
turn is told "this device has no <source> to look at". File abilities go to that
device if it can, otherwise to any that can.

**Note:** a key gives a device everything the local socket gives: every
command and every admin op, including `access` and `mcp.add`. There are no
read-only keys.

**Note:** the server does not tell one client's turns from another's on the
event stream: every client sees every event, including the `user` and
`assistant` of turns started elsewhere. A client that speaks should speak
`sentence` events only for turns it started (as the client daemon does).

**A client's own MCP servers.** Some MCP servers can only run where the
client is — Talaris's (`talaris-core mcp`) reads that machine's encrypted
store. A client lists them in `client.json`, in the same shape as the server's
`mcpServers`:

```json
{ "server": "home-server:8790", "key": "hc_…", "device": "laptop",
  "mcpServers": { "talaris": { "command": "node", "args": ["…/talaris-core/dist/src/index.js", "mcp"] } } }
```

The client starts them and offers their tools in its hello (`tools`), only the
read-only ones unless an entry says `"allow": "all"` (or turns tools on one by
one with `tools`, as on the server). On the server they are tools like its own,
named `server__tool`; a name the server already uses becomes
`<device>-<server>`. A call is sent to that client as the `mcp` ability; a tool
that changes something waits for the user's yes, as every other's does. They
go when the client disconnects. `mcp.list` shows them with `device` set and
`target` "on <device>"; they are changed in the client's `client.json`, not
with `mcp.add`. Running locally, a `client.json`'s `mcpServers` are simply
connected as more servers.

**Reconnecting.** A client that loses the link tries again after 3 seconds, or
after a minute if it was refused (`4003`). Replies still pending are answered
`{ ok: false, error: "Lost the connection to the server." }`.
