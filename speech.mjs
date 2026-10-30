#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 Jeff Moore
// Speech: sound into words, words into sound, and a voice into a voiceprint.
//
// One implementation, used wherever speech is done: by the brain, for every
// device that sends it what it heard; by a device that does its own (one away
// from its brain's speech, or set to); and, run as `node speech.mjs serve`, by
// a machine kept for it (the AI server, beside Ollama), which a brain then
// reaches by its address (`speechUrl`).
//
//   createSpeech(cfg, { socket })   whisper.cpp, Kokoro or Piper, and TitaNet, here
//   remoteSpeech(url, key)          the same, asked of a speech service
//
// Both give: start(), stop(), ready (what can be done), transcribe(pcm,
// prompt) -> text, synthesize(text, { engine, voice }) -> { pcm, rate }, and
// embed(pcm) -> a unit-length voiceprint vector. Sound is 16 kHz 16-bit mono in,
// 16-bit mono at `rate` out.

import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { connect } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SHARE } from "./env.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const RUNTIME = process.env.XDG_RUNTIME_DIR ?? "/tmp";
const WHISPER = join(SHARE, "whisper.cpp", "build", "bin", "whisper-cli");
const PIPER = join(SHARE, "piper", "piper");
const KOKORO = join(SHARE, "kokoro-multi-lang-v1_0");
const TITANET = join(SHARE, "speaker", "nemo_en_titanet_small.onnx");
const KOKORO_RATE = 24000;
export const KOKORO_VOICES = ("af_alloy,af_aoede,af_bella,af_heart,af_jessica,af_kore,af_nicole,af_nova,af_river,af_sarah,af_sky,"
  + "am_adam,am_echo,am_eric,am_fenrir,am_liam,am_michael,am_onyx,am_puck,am_santa,bf_alice,bf_emma,bf_isabella,bf_lily,"
  + "bm_daniel,bm_fable,bm_george,bm_lewis").split(",");

// The commands, where install.sh put their programs; null where it did not.
export const SPEECH_DEFAULTS = {
  // {prompt} is words whisper should expect, so names come out right.
  stt: existsSync(WHISPER) ? `'${WHISPER}' -m '${SHARE}/models/ggml-base.en.bin' -f {file} -nt -np -t 6 --prompt {prompt}` : null,
  // Reads one sentence on stdin and writes it as raw 16-bit mono audio on stdout ({voice} is the voice's .onnx file).
  tts: existsSync(PIPER) ? `'${PIPER}' --model {voice} --output-raw` : null,
};

const piperFile = (voice) => join(SHARE, "voices", `${voice}.onnx`);
function piperRate(voice) {
  try { return JSON.parse(readFileSync(`${piperFile(voice)}.json`, "utf8")).audio.sample_rate; } catch { return 22050; }
}
const kokoroSpeaker = (voice) => Math.max(0, KOKORO_VOICES.indexOf(voice));

function wav(pcm) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + pcm.length, 4); header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(16000, 24); header.writeUInt32LE(32000, 28); header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34); header.write("data", 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function unit(vector) {
  let norm = 0;
  for (const x of vector) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  return Array.from(vector, (x) => x / norm);
}

const collect = (child, input) => new Promise((resolve) => {
  const chunks = [];
  child.stdout.on("data", (chunk) => chunks.push(chunk));
  child.stdin?.on("error", () => {});
  child.on("close", () => resolve(Buffer.concat(chunks)));
  child.on("error", () => resolve(Buffer.concat(chunks)));
  if (input !== undefined) child.stdin.end(input);
});

let made = 0;

// Speech done on this machine. `cfg` gives stt, tts, engine, voice, kokoroVoice and kokoroSpeed.
export function createSpeech(cfg, { socket = join(RUNTIME, "heymorgan-tts.sock") } = {}) {
  let helper = null;
  let kokoroUp = false;
  let extractor = null;

  const speech = {
    // The Kokoro voice is kept loaded by a helper; Piper is started for each sentence.
    start() {
      if (cfg.engine === "kokoro" && existsSync(join(KOKORO, "model.onnx")) && !helper) {
        helper = spawn("node", [join(HERE, "kokoro.mjs"), socket, String(kokoroSpeaker(cfg.kokoroVoice)), String(cfg.kokoroSpeed ?? 1)], { stdio: ["ignore", "ignore", "pipe"] });
        helper.stderr.setEncoding("utf8");
        helper.stderr.on("data", (text) => { if (text.includes("kokoro ready")) kokoroUp = true; });
        helper.on("exit", () => { kokoroUp = false; helper = null; });
        helper.on("error", () => { kokoroUp = false; helper = null; });
      }
      if (existsSync(TITANET) && !extractor) {
        try {
          const sherpa = createRequire(import.meta.url)("sherpa-onnx-node");
          extractor = new sherpa.SpeakerEmbeddingExtractor({ model: TITANET, numThreads: 2, provider: "cpu" });
        } catch (error) { console.error(`voices: ${error.message}`); }
      }
      return speech;
    },
    stop() { helper?.kill("SIGTERM"); },
    // The voice to keep loaded: a speech service speaks in whichever voice its brain is set to, and follows it when it changes.
    use({ engine, kokoroVoice, kokoroSpeed, voice } = {}) {
      const before = JSON.stringify([cfg.engine, cfg.kokoroVoice, cfg.kokoroSpeed]);
      Object.assign(cfg, Object.fromEntries(Object.entries({ engine, kokoroVoice, kokoroSpeed, voice }).filter(([, value]) => value !== undefined && value !== null)));
      if (JSON.stringify([cfg.engine, cfg.kokoroVoice, cfg.kokoroSpeed]) === before) return;
      helper?.kill("SIGTERM");
      helper = null;
      kokoroUp = false;
      speech.start();
    },
    get ready() {
      const kokoro = kokoroUp;
      return {
        stt: Boolean(cfg.stt), tts: Boolean(kokoro || cfg.tts), voiceprints: Boolean(extractor),
        engine: kokoro ? "kokoro" : "piper", voice: kokoro ? cfg.kokoroVoice : cfg.voice, rate: kokoro ? KOKORO_RATE : piperRate(cfg.voice),
      };
    },

    transcribe(pcm, prompt = "") {
      return new Promise((resolve, reject) => {
        if (!cfg.stt) return reject(new Error("no speech-to-text command configured (stt)"));
        const file = join(RUNTIME, `heymorgan-${process.pid}-${made++}.wav`);
        writeFileSync(file, wav(pcm), { mode: 0o600 });
        const command = cfg.stt.replace("{file}", `'${file}'`).replace("{prompt}", `'${String(prompt).replace(/'/g, "")}'`);
        let out = "";
        const child = spawn("sh", ["-c", command], { stdio: ["ignore", "pipe", "ignore"] });
        child.stdout.setEncoding("utf8");
        child.stdout.on("data", (text) => { out += text; });
        child.on("error", (error) => { rmSync(file, { force: true }); reject(error); });
        child.on("exit", (code) => {
          rmSync(file, { force: true });
          if (code !== 0) return reject(new Error(`speech-to-text exited with code ${code}`));
          // whisper marks non-speech as [BLANK_AUDIO], (music) and the like
          resolve(out.replace(/\[[^\]]*\]|\([^)]*\)/g, " ").replace(/\s+/g, " ").trim());
        });
      });
    },

    // One sentence. Another engine or voice than the one kept loaded (a preview) is made once, more slowly.
    async synthesize(text, { engine, voice } = {}) {
      // Kokoro still loading (just started, or its voice just changed): waited for, rather than answered in another voice.
      for (let waited = 0; engine === undefined && helper && !kokoroUp && waited < 20_000; waited += 100) await new Promise((done) => setTimeout(done, 100));
      engine ??= kokoroUp ? "kokoro" : "piper";
      if (engine === "kokoro") {
        if (kokoroUp && (!voice || voice === cfg.kokoroVoice)) {
          const source = connect(socket);
          const chunks = [];
          const pcm = await new Promise((resolve) => {
            source.on("data", (chunk) => chunks.push(chunk));
            source.on("end", () => resolve(Buffer.concat(chunks)));
            source.on("error", () => resolve(Buffer.concat(chunks)));
            source.end(text + "\n");
          });
          return { pcm, rate: KOKORO_RATE };
        }
        if (existsSync(join(KOKORO, "model.onnx"))) {
          const child = spawn("node", [join(HERE, "kokoro.mjs"), "--pcm", String(kokoroSpeaker(voice ?? cfg.kokoroVoice)), String(cfg.kokoroSpeed ?? 1), text], { stdio: ["ignore", "pipe", "ignore"] });
          return { pcm: await collect(child), rate: KOKORO_RATE };
        }
      }
      voice ??= cfg.voice;
      const command = cfg.tts ?? SPEECH_DEFAULTS.tts;
      if (!command) return { pcm: Buffer.alloc(0), rate: 22050 };
      const child = spawn("sh", ["-c", "exec " + command.replace("{voice}", `'${piperFile(voice)}'`)], { stdio: ["pipe", "pipe", "ignore"] });
      return { pcm: await collect(child, text + "\n"), rate: piperRate(voice) };
    },

    async embed(pcm) {
      if (!extractor) throw new Error("the voice model is not installed");
      const samples = new Float32Array(pcm.length / 2);
      for (let i = 0; i < samples.length; i++) samples[i] = pcm.readInt16LE(i * 2) / 32768;
      const stream = extractor.createStream();
      stream.acceptWaveform({ samples, sampleRate: 16000 });
      stream.inputFinished();
      return unit(extractor.compute(stream, false));
    },
  };
  return speech;
}

// Speech asked of a speech service (`node speech.mjs serve` elsewhere).
export function remoteSpeech(url, key = "", cfg = {}) {
  const base = String(url).replace(/\/+$/, "");
  const headers = key ? { Authorization: `Bearer ${key}` } : {};
  let known = { stt: false, tts: false, voiceprints: false, engine: null, voice: null, rate: 24000 };
  const ask = async (path, body, extra = {}, wait = 60_000) => {
    const response = await fetch(`${base}${path}`, { method: body === undefined ? "GET" : "POST", headers: { ...headers, ...extra }, body, signal: AbortSignal.timeout(wait) });
    if (!response.ok) throw new Error(`the speech service answered ${response.status}: ${(await response.text()).slice(0, 200)}`);
    return response;
  };
  const check = () => ask("/status", undefined, {}, 5000).then((r) => r.json()).then((status) => { known = status; }).catch((error) => {
    known = { ...known, stt: false, tts: false, voiceprints: false };
    console.error(`speech: ${base} is not answering (${error.message})`);
  });
  let timer = null;
  return {
    start() { check(); timer = setInterval(check, 60_000); timer.unref?.(); return this; },
    stop() { clearInterval(timer); },
    get ready() { return known; },
    transcribe: async (pcm, prompt = "") => (await (await ask("/transcribe", pcm, { "Content-Type": "application/octet-stream", "X-Prompt": encodeURIComponent(prompt) })).json()).text,
    // A preview names its engine and voice; otherwise the service is told the brain's, and keeps it loaded.
    async synthesize(text, { engine, voice } = {}) {
      const keep = engine === undefined && voice === undefined
        ? { engine: cfg.engine, kokoroVoice: cfg.kokoroVoice, kokoroSpeed: cfg.kokoroSpeed, voice: cfg.voice } : null;
      const response = await ask("/speak", JSON.stringify({ text, engine, voice, keep }), { "Content-Type": "application/json" });
      return { pcm: Buffer.from(await response.arrayBuffer()), rate: Number(response.headers.get("X-Rate")) || 24000 };
    },
    embed: async (pcm) => (await (await ask("/embed", pcm, { "Content-Type": "application/octet-stream" })).json()).vector,
  };
}

// ---------------------------------------------------------------- as a service
//
//   node speech.mjs serve       on the machine kept for speech
//
// SPEECH_PORT (default 8791) and SPEECH_HOST (default 0.0.0.0), and
// SPEECH_KEY, which every request must give as `Authorization: Bearer <key>`;
// all three may be in the checkout's .env. Its voice (engine, kokoroVoice,
// voice, kokoroSpeed) and commands (stt, tts) are this machine's config.json,
// or the defaults. It keeps nothing: sound comes in, words or sound go out.

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === "serve") {
  const { createServer } = await import("node:http");
  const { CONFIG_HOME } = await import("./env.mjs");
  const key = process.env.SPEECH_KEY ?? "";
  if (!key) { console.error("speech: set SPEECH_KEY (in .env or the unit) to the key brains will give"); process.exit(1); }
  let saved = {};
  try { saved = JSON.parse(readFileSync(process.env.HEYMORGAN_CONFIG ?? join(CONFIG_HOME, "config.json"), "utf8")); } catch { /* the defaults */ }
  const cfg = { engine: "kokoro", kokoroVoice: "af_heart", kokoroSpeed: 1, voice: "en_US-amy-medium", ...SPEECH_DEFAULTS, ...saved };
  const speech = createSpeech(cfg, { socket: join(RUNTIME, "heymorgan-speech-tts.sock") }).start();
  const body = (request) => new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => { size += chunk.length; if (size > 32 * 1024 * 1024) request.destroy(); else chunks.push(chunk); });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
  const port = Number(process.env.SPEECH_PORT ?? 8791);
  createServer(async (request, response) => {
    const send = (code, value, extra = {}) => {
      const out = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value));
      response.writeHead(code, { "Content-Type": Buffer.isBuffer(value) ? "application/octet-stream" : "application/json", ...extra });
      response.end(out);
    };
    if (request.headers.authorization !== `Bearer ${key}`) return send(401, { error: "not allowed" });
    try {
      if (request.method === "GET" && request.url === "/status") return send(200, speech.ready);
      if (request.method !== "POST") return send(404, { error: "no such thing" });
      if (request.url === "/transcribe") {
        const prompt = decodeURIComponent(String(request.headers["x-prompt"] ?? ""));
        return send(200, { text: await speech.transcribe(await body(request), prompt) });
      }
      if (request.url === "/speak") {
        const { text, engine, voice, keep } = JSON.parse(String(await body(request)));
        // The brain's voice, kept loaded from now on (a change of voice in its settings takes a few seconds once).
        if (keep) speech.use(keep);
        const { pcm, rate } = await speech.synthesize(String(text ?? ""), keep ? {} : { engine, voice });
        return send(200, pcm, { "X-Rate": String(rate) });
      }
      if (request.url === "/embed") return send(200, { vector: await speech.embed(await body(request)) });
      return send(404, { error: "no such thing" });
    } catch (error) {
      return send(500, { error: error.message });
    }
  }).listen(port, process.env.SPEECH_HOST ?? "0.0.0.0", () => console.error(`speech: serving on port ${port} (${JSON.stringify(speech.ready)})`));
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { speech.stop(); process.exit(0); });
}
