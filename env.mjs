// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 Jeff Moore
// Which part this copy of Morgan plays, settled before anything else looks.
//
//   server  the brain: memory, the model, the Oracle, reminders, and speech for
//           its devices. No microphone, no desktop. It listens on PORT for
//           devices, however many: one, the laptop it shares, or ten.
//   client  a device: the microphone, the wake word, the speaker, the screen
//           and folders it may offer. It reaches a brain at an address, with
//           a key. The plugin, the window, Talaris and the command talk to it.
//
// A laptop with its own brain runs both, as two services: the brain
// (heymorgan-brain, `heymorgan serve`) and the device, a client of
// localhost:8790. A Pi or a second laptop is the same device, with another
// address. That is the only difference.
//
// A .env in the checkout giving PORT makes a server kept in that checkout, as
// the other apps on the home server are configured: its data in data/. A brain
// started in someone's session (HEYMORGAN_ROLE=server, from heymorgan-brain)
// keeps that account's usual folders and login keyring. A client.json naming a
// server makes a client.
//
//   local   the whole of Morgan in one process, as it was before there were
//           devices: kept for trials (tests/trial.sh), and for a machine not
//           yet set up, which `heymorgan serve` turns into brain and device.
import { existsSync, lstatSync, readFileSync, renameSync, symlinkSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = dirname(fileURLToPath(import.meta.url));

// Morgan was heyclaude until 2026-10-23 (docs/rename.md). Its settings are
// HEYMORGAN_*, and a HEYCLAUDE_* that is still set somewhere is read as the
// same thing; everything after this reads only the new names.
for (const [name, value] of Object.entries(process.env)) {
  if (name.startsWith("HEYCLAUDE_")) process.env[`HEYMORGAN_${name.slice("HEYCLAUDE_".length)}`] ??= value;
}

// The folders kept under the old name are moved to the new one the first time
// this runs, each with one rename (the speech models are several GB, and are
// never copied), and a link is left at the old place for anything that still
// says heyclaude. With both there, nothing is moved and the new one is used.
function folder(parent) {
  const now = join(parent, "heymorgan");
  const before = join(parent, "heyclaude");
  let old = null;
  try { old = lstatSync(before); } catch { /* never had one */ }
  if (old?.isDirectory() && !existsSync(now)) {
    try {
      renameSync(before, now);
      symlinkSync(now, before);
      console.error(`moved ${before} to ${now}`);
    } catch (error) {
      console.error(`could not move ${before} to ${now}: ${error.message}`);
    }
  } else if (old?.isDirectory()) {
    console.error(`both ${before} and ${now} are there: using ${now}, and leaving ${before} as it is`);
  }
  return existsSync(now) || !existsSync(before) ? now : before;
}

export const CONFIG_HOME = folder(join(homedir(), ".config"));
export const SHARE = folder(join(homedir(), ".local", "share"));

// A configuration named outright is a trial run beside the real one (see tests/trial.sh).
export const TRIAL = Boolean(process.env.HEYMORGAN_CONFIG);

const dotenv = join(ROOT, ".env");
const fromDotenv = new Set();
if (existsSync(dotenv)) {
  for (const line of readFileSync(dotenv, "utf8").split("\n")) {
    const found = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (found && !(found[1] in process.env)) {
      process.env[found[1]] = found[2].replace(/^(["'])(.*)\1$/, "$2");
      fromDotenv.add(found[1]);
    }
  }
}

export const CLIENT_FILE = process.env.HEYMORGAN_CLIENT_FILE ?? join(CONFIG_HOME, "client.json");
let client = {};
try { client = JSON.parse(readFileSync(CLIENT_FILE, "utf8")); } catch { /* none: not a client */ }
// { server: "host:port" or "https://host/heymorgan", key: "hc_..." }
export const CLIENT = client;

export const ROLE = process.env.HEYMORGAN_ROLE ?? (process.env.PORT ? "server" : client.server ? "client" : "local");

// A client's settings are the server's, mirrored here as they change; the
// laptop's own config.json is left as it was, for running Morgan locally again.
export const MIRROR = process.env.HEYMORGAN_MIRROR ?? join(CONFIG_HOME, "mirror.json");
if (ROLE === "client" && existsSync(MIRROR)) process.env.HEYMORGAN_CONFIG ??= MIRROR;

// A device with no desktop (a Pi in a speaker): HEYMORGAN_HEADLESS=1 in its
// unit. It waits for no desktop to appear, and having no login keyring, it
// keeps its key (which seals only the voices taught to it) in a file only its
// account can read.
export const HEADLESS = process.env.HEYMORGAN_HEADLESS === "1";
if (HEADLESS && !HOUSED) process.env.HEYMORGAN_KEY_FILE ??= join(CONFIG_HOME, "device.key");

// A brain kept in its checkout (the home server's), or one in someone's session (a laptop's own).
export const HOUSED = ROLE === "server" && (fromDotenv.has("PORT") || Boolean(process.env.HEYMORGAN_DATA));
const RUNTIME = process.env.XDG_RUNTIME_DIR ?? "/tmp";
// The brain's command socket where it shares a machine with a device, whose is heymorgan.sock.
export const BRAIN_SOCKET = join(RUNTIME, "heymorgan-brain.sock");
if (ROLE === "server" && !HOUSED) process.env.HEYMORGAN_SOCKET ??= BRAIN_SOCKET;

if (HOUSED) {
  const data = process.env.HEYMORGAN_DATA ?? join(ROOT, "data");
  process.env.HEYMORGAN_DATA = data;
  process.env.HEYMORGAN_CONFIG ??= join(data, "config.json");
  process.env.HEYMORGAN_MEMORY ??= join(data, "memory");
  // The memory key, which on the laptop is in the login keyring; a server has none.
  process.env.HEYMORGAN_KEY_FILE ??= join(data, "memory.key");
  // The server's own command socket, for `heymorgan` run on the server.
  process.env.HEYMORGAN_SOCKET ??= join(data, "heymorgan.sock");
}
