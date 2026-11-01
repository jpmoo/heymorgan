// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 Jeff Moore
// What kind of turn this is, decided in one place.
//
// The local model answers anything put to it with the same assurance, right or
// wrong, and does not reliably reach for a tool when told to. So before it
// answers, a narrow call sorts what the user said, and the daemon acts on the
// result: looks things up, works out the sum, consults the Oracle, picks a
// lapsed conversation back up. This replaced lists of phrases ("my calendar",
// "who won", "try again"), each of which knew only the wordings it had been
// taught. tests/sorting.json holds the wordings this must get right; a change
// to the instructions below is checked against all of them with
// `node tests/sort.mjs` before it is trusted.

const KINDS = ["yours", "conversation", "settled", "world", "current"];

// What the turn calls for is given as a list of only what applies, which is
// most often nothing: nine yes-or-noes took half as long again to write out.
const NEEDS = ["calendar_tasks_or_notes", "computer_files", "sum", "oracle", "asks_for_change", "reminder_or_timer", "asks_to_keep", "needs_seeing", "earlier_talk"];

const SCHEMA = {
  type: "object",
  properties: {
    follows: { type: "boolean" },
    about: { type: "string", enum: KINDS },
    calls_for: { type: "array", items: { type: "string", enum: NEEDS } },
  },
  required: ["follows", "about", "calls_for"],
};

const instructions = (name) => [
  `Sort the user's latest message to ${name}, a voice assistant. Do not answer it. Give three things: follows, about, and calls_for.`,
  "",
  "follows: true if the message cannot be understood without what was said just before it: \"try again\", \"I mean...\",",
  "\"what about Friday?\", \"and the other one?\", \"say that again\", \"no, the second one\", \"why?\", or a question that says",
  "he, she, it or that of something not named in the message. True for such a message even when nothing before it is shown.",
  "False if it stands on its own.",
  "",
  "about: one of these. For a message that follows, first work out the whole question from what was said before (after talk",
  "of a film, \"what else has he made?\" is a question about a film director, so world; after talk of a state's school",
  "rules, \"and what about grade 6?\" is a question about those rules, so world), and sort that. Go by what the user is",
  "asking, not by what the assistant said it would look through.",
  "- yours: the user's own life, people, things, plans, work, files or earlier conversations; an instruction to the assistant",
  "  to remember, set, make, change, add, create, cancel or do something; or about the assistant itself. The user's own tasks,",
  "  calendar, events, meetings, reminders, mail and notes are always yours, whatever day they are about. So is anything about",
  "  the files and folders on the user's computer: listing, finding or reading one, or a question about what a file says,",
  "  even when the file is about the world. So is a question",
  "  about anything the user calls my or mine: my commute, my sister, my recipe.",
  "- conversation: small talk, greetings, thanks, feelings, opinions, jokes, brainstorming, naming things, wording, writing or",
  "  rewriting, advice on how to go about something where there is no single right answer.",
  "- world: a question of fact about the world that does not depend on what is happening now: a particular film, book, piece of",
  "  music, product, company, place or person; a figure, count, measurement or statistic; how something works; anything in",
  "  science, medicine, law, money or tax. This is the usual kind for a question of fact.",
  "- settled: only a fact every schoolchild is taught and that never changes: the capital of a large country, the planets,",
  "  the boiling point of water, the symbol of a common element, who wrote one of the most famous classics, how many days",
  "  are in a week, what a common word means. Nothing about law, medicine, money, technology, a particular modern work, or a",
  "  number most adults could not give from memory is ever settled. If there is any doubt, it is world, not settled.",
  "  A question asking only what time it is, what the date is or what day of the week it is, is settled too: the assistant",
  "  is always told those. Anything else that mentions today (today's note, today's tasks) is not.",
  "- current: depends on what is happening now or lately in the world: news, results, scores, reviews, prices, weather,",
  "  versions, public events, this year's rates or limits. Who holds an office, runs a company or holds a title or record",
  "  now (a president, a chief executive, a champion) is current however long they have held it, because it can change.",
  "  The user's own schedule is yours, not current. Asking what time, date or day it is is never current.",
  "",
  "calls_for: a list of every one of the following that is true of the message. For most messages none is, and the list is",
  "then empty.",
  "",
  "calendar_tasks_or_notes: true only if answering needs the user's calendar, task list, projects, notes or mail to be read: what is on, due,",
  "available, overdue, planned or scheduled; when a meeting is; what a note or task says. When the message follows a question",
  "of that sort and asks for it again (\"try again\"), or for another day or another part of it, this is true as well.",
  "False for everything else. In particular false for who the user's family, friends and pets are, where anyone lives, what",
  "the user does, owns or likes, and their routines: the assistant knows those by heart. False for an instruction to create or",
  "change something, for anything about the world, and for files and folders on the computer.",
  "",
  "computer_files: the user wants a file or folder on their computer listed, found, read, kept or asked about: \"what's in",
  "my Downloads folder?\", \"read the recipe file\", \"find the PDF about the budget\", \"what does that notes file say about",
  "the deadline?\". The answer is in the file, so it is never needs_seeing and never a question for the Oracle.",
  "",
  "sum: true if the message asks for arithmetic to be worked out on numbers it gives: a percentage, a total, a tip, a split,",
  "a product, a difference, an average. False for a question whose answer merely is a number.",
  "",
  `oracle: true only if the user asks in so many words for the Oracle to be asked or consulted, or what the Oracle says or thinks.`,
  "",
  "asks_for_change: true if the user is telling the assistant to make, add, change, move, complete, archive, delete, send or",
  "schedule something in their task list, calendar, projects, notes or mail, in whatever words: \"add a task\", \"put milk on",
  "the list\", \"push that to Friday\", \"I finished the review\", \"get rid of that one\". False for a question about what is",
  "there or about what has been done (\"did you add it?\"), and false for timers and reminders.",
  "",
  "reminder_or_timer: true if the message is about a timer, alarm or reminder the assistant itself keeps: setting one (\"remind",
  "me\", \"wake me at six\", \"let me know in ten minutes\", \"don't let me forget\"), asking what is set, or cancelling, moving",
  "or snoozing one, including when that follows talk of reminders.",
  "",
  "asks_to_keep: true if the user asks for something to be remembered, saved, kept, stored or learned for later: a fact about",
  "them, a file, a document, a recipe, a picture. False when they only ask what is already remembered.",
  "",
  "needs_seeing: true if answering needs the assistant to look right now at the camera, the screen, a window or the",
  "clipboard: \"what am I holding?\", \"who is this?\", \"what's on my screen?\", \"read what I copied\", \"how do I look?\",",
  "\"remember this is me\". False for a figure of speech (\"let's see\", \"look up\", \"I see\") and for pictures already saved.",
  "",
  "earlier_talk: the user asks about their earlier conversations with the assistant: when they last talked, what they talked",
  "about on a day, what the assistant told them or what was decided before (\"what did you say about the boiler last week?\").",
  "Not for what was said a moment ago in this conversation, and not for facts about the user.",
].join("\n");

// Whether the message is about the weather, and whether it turns on where the user is: asked apart from the rest,
// in a call of its own made alongside it. Asked in the same instructions, these moved the model's other sortings
// (a note to jot down taken for something to keep, "make it four" for no reminder: tests/sort.mjs, every way it
// was tried); asked apart, the rest is sorted exactly as before.
const PLACE_SCHEMA = { type: "object", properties: { weather: { type: "boolean" }, where_user_is: { type: "boolean" }, place: { type: "string" } }, required: ["weather", "where_user_is", "place"] };
const placeInstructions = (name) => [
  `Two questions about the user's latest message to ${name}, a voice assistant. Do not answer the message.`,
  "",
  "weather: does the user ask about the weather or a forecast, for any day and any place, or about something that turns on",
  "it: rain, snow, temperature, wind, an umbrella or a coat, what to wear outside? A message that follows a question about the",
  "weather and asks more about it is one too. False for weather as a figure of speech (\"under the weather\", \"a cold\") and",
  "for climate as a subject of fact (\"why is the Sahara dry?\").",
  "",
  "where_user_is: does answering depend on where the user is at this moment: where they are, what is near them or nearby, how",
  "far something is from here, what is around here, the local time where they are? False for where they live or work as a",
  "fact about them (\"where do I live?\"), and false when the places are named instead (\"what's near Times Square?\",",
  "\"how far is Boston from Chicago?\"): only here, me and nearby point at where the user is.",
  "",
  "place: when the message is about the weather, the place the user names for it, as they say it, with its state or country",
  "if they give one (\"Tempe\", \"Clinton, NJ\", \"Paris, France\"); a message that follows takes the place it asks about.",
  "Empty when they name none (\"what's the weather tomorrow?\") or when it is not about the weather.",
].join("\n");

async function sortPlace({ url, model, keepAlive, name }, text, before) {
  try {
    const answer = await fetch(`${url}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        model, stream: false, think: false, keep_alive: keepAlive, options: { temperature: 0 }, format: PLACE_SCHEMA,
        messages: [
          { role: "system", content: placeInstructions(name) },
          { role: "user", content: `${before ? `Said just before:\n${before}\n\n` : ""}The message:\n${text}` },
        ],
      }),
    });
    const got = JSON.parse((await answer.json()).message?.content ?? "{}");
    return { weather: got.weather === true, where: got.where_user_is === true, place: got.weather === true ? String(got.place ?? "").trim().slice(0, 80) : "" };
  } catch (error) {
    console.error(`sort (weather, place): ${error.message}`);
    return { weather: false, where: false, place: "" };
  }
}

// Whether what was looked up just before already holds the answer: a question about the user's records is answered from
// a lookup, but not every one needs a new one. "Which of those tasks go with those events?", straight after both were
// looked up, was sent back for not looking, twice, and a good answer was replaced with "I couldn't look that up";
// "and today's?", after tomorrow's, is about something not looked up, and must be. Asked apart, as the place is: one
// question more in the main sorting unsettled the rest. Only when something was looked up in the turn before.
const IN_VIEW_SCHEMA = { type: "object", properties: { in_view: { type: "boolean" } }, required: ["in_view"] };
const inViewInstructions = (name) => [
  `One question about the user's latest message to ${name}, a voice assistant. Do not answer the message.`,
  "",
  "in_view: can the message be answered entirely from what was looked up just before, as shown, without looking anything up",
  "again? True for a judgment, comparison, choice or summary of what came back (\"which of those tasks go with those",
  "meetings?\", \"which is most urgent?\", \"say that again\", \"so which day is busiest?\"). False when it asks about anything",
  "that was not looked up: another day or date, another person, another list, or a part the lookup did not cover (\"and",
  "today's?\" after tomorrow's were looked up; Tuesday's tasks when only Monday's were); and false when nothing was looked up.",
].join("\n");

async function sortInView({ url, model, keepAlive, name }, text, before, looked) {
  if (!looked) return false;
  try {
    const answer = await fetch(`${url}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        model, stream: false, think: false, keep_alive: keepAlive, options: { temperature: 0 }, format: IN_VIEW_SCHEMA,
        messages: [
          { role: "system", content: inViewInstructions(name) },
          { role: "user", content: `Said just before:\n${before}\n\nLooked up just before, and what came back:\n${looked}\n\nThe message:\n${text}` },
        ],
      }),
    });
    return JSON.parse((await answer.json()).message?.content ?? "{}").in_view === true;
  } catch (error) {
    console.error(`sort (in view): ${error.message}`);
    return false;
  }
}

/** The lookups of the turn before, each with the start of what came back; empty if there were none. */
function lookedUp(earlier) {
  const start = earlier.findLastIndex((message) => message.role === "user");
  const turn = start < 0 ? [] : earlier.slice(start);
  const lines = [];
  for (const message of turn) {
    for (const call of message.tool_calls ?? []) lines.push(`${call.function?.name}(${JSON.stringify(call.function?.arguments ?? {})})`);
    if (message.role === "tool") lines.push(`  -> ${String(message.content ?? "").replace(/\s+/g, " ").slice(0, 700)}`);
  }
  return lines.join("\n");
}

// Whether a reply says something was done that was not, or not as it was: read against the record of the turn, the
// tools called and what they returned. Asked of every reply, whatever the turn was sorted as: "I've saved that to your
// routines" (it went to Tech setup) and "I've noted that Lizzie won't be joining" (nothing was saved) came on turns no
// check looked at, because none was sorted as a change.
const DONE_SCHEMA = { type: "object", properties: { says_done: { type: "boolean" }, all_backed: { type: "boolean" }, what_is_wrong: { type: "string" } },
  required: ["says_done", "all_backed", "what_is_wrong"] };
const doneInstructions = (name) => [
  `${name}, a voice assistant, has written the reply below. Check it against the record of what was done in this turn. Do not`,
  "rewrite the reply.",
  "",
  `says_done: does the reply say ${name} has already done something: saved, noted, remembered, added, moved, removed, changed,`,
  "sent, set, booked or scheduled something, or put it somewhere? False for what it offers, plans or is about to do (\"I'll",
  "add that, is that okay?\", \"I'll go ahead and set that up now\", \"I'm going to create…\"), for questions, and for telling",
  "the user what it found or what their things hold.",
  "",
  "all_backed: if it says so, is every such thing in the record, done as the reply says: the same thing, put in the same",
  "place? \"Saved to your routines\" when the record says it was saved in Tech setup is not backed; nor is \"I've noted",
  "that\" when the record shows nothing saved. True when the reply says nothing was done. Check only what it says was done",
  "now: where things stood already, from earlier in the conversation (\"so it's now only under routines\", of a note saved",
  "there before), is not a claim about this turn, and neither is a summary of what was done.",
  "",
  "what_is_wrong: when not backed, in a sentence, what the reply says that the record does not show, or shows otherwise.",
  "Empty otherwise.",
].join("\n");

/** { saysDone, backed, wrong } for a reply against its turn's record (lines: each tool called and what it returned). */
export async function checkDone({ url, model, keepAlive, name }, reply, record) {
  try {
    const answer = await fetch(`${url}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        model, stream: false, think: false, keep_alive: keepAlive, options: { temperature: 0 }, format: DONE_SCHEMA,
        messages: [
          { role: "system", content: doneInstructions(name) },
          { role: "user", content: `What was done in this turn:\n${record || "Nothing: no tool was called."}\n\nThe reply:\n${reply}` },
        ],
      }),
    });
    const got = JSON.parse((await answer.json()).message?.content ?? "{}");
    const saysDone = got.says_done === true;
    return { saysDone, backed: !saysDone || got.all_backed === true, wrong: String(got.what_is_wrong ?? "").trim().slice(0, 300) };
  } catch (error) {
    console.error(`check (done): ${error.message}`);
    return { saysDone: false, backed: true, wrong: "" }; // unchecked is let through: the check is a help, not a gate
  }
}

// Returns { follows, about, lookup, sum, oracle, change, reminder, keep, look, earlier, files, weather, where, place, inView }, or null if it could not be sorted.
// `earlier` is the last few messages of the conversation: [{ role, content }].
export async function sortTurn({ url, model, keepAlive, name }, text, earlier = []) {
  // The user's words whole, and the gist of each reply: a reply's opening is
  // often the assistant saying what it will look through ("let me check your
  // files and projects"), which made a question about the world that followed
  // it look like one about the user's own records.
  const gist = (text) => text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/)
    .filter((sentence) => !/^(let me|i['’]ll|i will|i['’]m going to|i am going to|i['’]d need to|first,? i)\b/i.test(sentence)).join(" ").slice(0, 300);
  const before = earlier.filter((message) => message.role !== "tool" && message.content).slice(-4)
    .map((message) => (message.role === "user" ? `User: ${message.content.slice(0, 500)}` : `${name}: ${gist(message.content)}`)).join("\n");
  // The weather and the user's place, asked at the same time, apart (sortPlace).
  const place = sortPlace({ url, model, keepAlive, name }, text, before);
  // And whether what was just looked up already answers it (sortInView), at the same time too.
  const inView = sortInView({ url, model, keepAlive, name }, text, before, lookedUp(earlier));
  try {
    const response = await fetch(`${url}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        model, stream: false, think: false, keep_alive: keepAlive, options: { temperature: 0 }, format: SCHEMA,
        messages: [
          { role: "system", content: instructions(name) },
          { role: "user", content: `${before ? `Said just before:\n${before}\n\n` : ""}The message to sort:\n${text}` },
        ],
      }),
    });
    const body = await response.json();
    if (!body.message) throw new Error(body.error ?? `no answer (HTTP ${response.status})`);
    const sorted = JSON.parse(body.message.content);
    if (!KINDS.includes(sorted.about)) return null;
    const calls = new Set(sorted.calls_for ?? []);
    const turn = {
      follows: sorted.follows === true, about: sorted.about, lookup: calls.has("calendar_tasks_or_notes"), sum: calls.has("sum"),
      oracle: calls.has("oracle"), change: calls.has("asks_for_change"), reminder: calls.has("reminder_or_timer"),
      keep: calls.has("asks_to_keep"), look: calls.has("needs_seeing"), earlier: calls.has("earlier_talk"), files: calls.has("computer_files"),
      ...(await place),
      inView: await inView,
    };
    // The weather, any day, is current: what a forecast says now, not a settled fact of the world.
    if (turn.weather && turn.about === "world") turn.about = "current";
    // The answer to a question about the user's files or earlier talk is in
    // the file or the record, whatever its subject: never the Oracle's, and
    // never a lookup in their services or a look at the screen.
    if (turn.files || turn.earlier) {
      if (turn.about !== "conversation") turn.about = "yours";
      if (turn.files) { turn.lookup = false; turn.look = false; }
    }
    return turn;
  } catch (error) {
    console.error(`sort: ${error.message}`);
    return null;
  }
}
