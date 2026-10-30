// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 Jeff Moore
// Two more devices on a trial brain (tests/remote.sh), speaking the protocol
// directly: wake arbitration, a voice taught on one and then again on the
// other, and the devices list. Run inside remote.sh:
//
//   SERVER_SPEECH=piper tests/remote.sh node tests/devices.mjs
import { execFileSync, spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";

const root = new URL("..", import.meta.url).pathname;
const env = { ...process.env, HEYMORGAN_ROLE: "server", HEYMORGAN_DATA: process.env.TRIAL_DATA };
delete env.HEYMORGAN_SOCKET;
const keyFor = (name) => execFileSync(join(root, "bin/heymorgan"), ["access", "add", name], { env, encoding: "utf8" }).match(/hc_[\w-]+/)[0];

let failures = 0;
const check = (what, ok, seen) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}${ok ? "" : `: ${JSON.stringify(seen)}`}`); if (!ok) failures++; };

function device(name) {
  const link = new WebSocket(`ws://127.0.0.1:${process.env.TRIAL_PORT}`);
  const waiting = new Map();
  let next = 0;
  const ready = new Promise((resolve, reject) => {
    link.on("open", () => link.send(JSON.stringify({ hello: { key: keyFor(name), device: name, kind: "trial", can: ["voice"] } })));
    link.on("message", (data) => {
      const message = JSON.parse(String(data));
      if (message.welcome) resolve(message.welcome);
      if (message.error) reject(new Error(message.error));
      if (message.speechResult) waiting.get(message.speechResult.id)?.(message.speechResult);
      if (message.id !== undefined && message.reply) waiting.get(`c${message.id}`)?.(message.reply);
    });
  });
  const speech = (op, args = {}) => new Promise((resolve, reject) => {
    const id = ++next;
    waiting.set(id, (answer) => (answer.error ? reject(new Error(answer.error)) : resolve(answer.result)));
    link.send(JSON.stringify({ speech: { id, op, args } }));
  });
  const command = (line) => new Promise((resolve) => {
    const id = ++next;
    waiting.set(`c${id}`, resolve);
    link.send(JSON.stringify({ id, command: line }));
  });
  return { ready, speech, command, close: () => link.close() };
}

// A voice made by Piper, as a microphone would give it.
function said(text, voice) {
  const share = join(homedir(), ".local/share/heymorgan");
  const raw = spawnSync(join(share, "piper/piper"), ["--model", join(share, "voices", `${voice}.onnx`), "--output-raw"], { input: text, maxBuffer: 64e6 }).stdout;
  return spawnSync("ffmpeg", ["-loglevel", "error", "-f", "s16le", "-ar", "22050", "-ac", "1", "-i", "-", "-f", "s16le", "-ar", "16000", "-ac", "1", "-"], { input: raw, maxBuffer: 64e6 }).stdout;
}

const kitchen = device("kitchen-dot");
const study = device("study");
const [welcome] = await Promise.all([kitchen.ready, study.ready]);
check("a device is told what speech the brain offers", welcome.speech?.stt && welcome.speech?.tts && welcome.speech?.voiceprints, welcome.speech);

// Two heard it: the one that heard it better answers.
const [quiet, loud] = await Promise.all([kitchen.speech("wake", { score: 1.5 }), study.speech("wake", { score: 4 })]);
check("the device that heard the wake word best answers", loud.go === true && quiet.go === false, { quiet, loud });
const late = await kitchen.speech("wake", { score: 9 });
check("a device that hears it a moment after one was chosen stands down", late.go === false, late);

// Taught on the kitchen Dot first: kept for every device. Taught again in the study: the study's own.
const lines = ["What is on my calendar for tomorrow afternoon?", "Remind me to pick up the dry cleaning.", "The quick brown fox jumps over the lazy dog."];
const samples = (voice) => lines.map((line) => said(line, voice).toString("base64"));
const first = await kitchen.speech("teach", { name: "Tester", scope: "auto", samples: samples("en_US-lessac-medium") });
check("the first device a voice is taught on makes the shared one", first.saved === "shared" && first.enrolled.includes("Tester"), first);
const again = await study.speech("teach", { name: "Tester", scope: "auto", samples: samples("en_US-hfc_female-medium") });
check("taught again on another device, it is that device's own", again.saved === "device", again);
const studyVoices = await study.speech("voices");
const kitchenVoices = await kitchen.speech("voices");
check("the study uses its own", studyVoices.prints.some((print) => print.name === "Tester" && print.own), studyVoices);
check("the kitchen still uses the shared one", kitchenVoices.prints.some((print) => print.name === "Tester" && !print.own), kitchenVoices);

// Whose voice: each device judges by the set it uses.
const lessac = said("Turn on the lights in the living room please, and tell me the weather.", "en_US-lessac-medium").toString("base64");
const inKitchen = await kitchen.speech("whose", { pcm: lessac, threshold: 0.4 });
const inStudy = await study.speech("whose", { pcm: lessac, threshold: 0.4 });
check("the kitchen, taught that voice, knows it", inKitchen.name === "Tester" && inKitchen.score > 0.5, inKitchen);
check("the study, taught another voice under that name, finds it less like", inStudy.score < inKitchen.score, { inKitchen, inStudy });

// The devices, as any of them may ask the brain.
const listed = await study.command(`admin ${JSON.stringify({ op: "devices.list" })}`);
const names = (listed.devices ?? []).filter((entry) => entry.connected).map((entry) => entry.name);
check("the brain lists its connected devices", ["kitchen-dot", "study"].every((name) => names.includes(name)), listed);
check("and which have voices of their own", listed.devices.find((entry) => entry.name === "study")?.ownVoices.includes("Tester"), listed.devices);

// Forgotten in the study: its own goes, and the shared one is used there again.
const forgot = await study.speech("forget", { name: "Tester" });
const afterForget = await study.speech("voices");
check("forgetting a device's own goes back to the shared one", forgot.enrolled.includes("Tester") && afterForget.prints.some((print) => print.name === "Tester" && !print.own), afterForget);

kitchen.close();
study.close();
console.log(failures ? `${failures} failed` : "all passed");
process.exit(failures ? 1 : 0);
