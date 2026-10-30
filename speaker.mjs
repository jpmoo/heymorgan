// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 Jeff Moore
// Whose voice is this? A small model turns a stretch of speech into a list of
// numbers that is much the same for one person and different for another
// (speech.mjs, `embed`). Voiceprints are kept sealed, as those numbers; no
// recording is kept.
//
// The brain keeps one set that every device uses and, for a device whose
// microphone hears a voice differently, that device's own, used there instead
// (`voices/devices/<device>/`). The first device a voice is taught on makes
// the shared one. A device doing its own speech keeps its set in its own
// memory folder.

import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { MEMORY, readSealed, writeSealed } from "./lib.mjs";

export const VOICEPRINTS = join(MEMORY, "voices");
const slug = (name) => String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

function unit(vector) {
  let norm = 0;
  for (const x of vector) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  return Array.from(vector, (x) => x / norm);
}

// The voices kept in one folder: the shared set, or one device's.
export function voiceStore(dir = VOICEPRINTS) {
  let known = [];
  const store = {
    dir,
    load() {
      known = !existsSync(dir) ? [] : readdirSync(dir).filter((file) => file.endsWith(".voice")).sort()
        .map((file) => JSON.parse(readSealed(join(dir, file))))
        .map((print) => ({ name: print.name, t: print.t, vectors: print.vectors.map(unit) }));
      return store;
    },
    get enrolled() { return known.map((print) => print.name); },
    get prints() { return known; },
    has: (name) => known.some((print) => slug(print.name) === slug(name)),
    save(name, vectors) {
      mkdirSync(dir, { recursive: true });
      writeSealed(join(dir, `${slug(name)}.voice`), JSON.stringify({ name, t: Date.now(), vectors: vectors.map((vector) => [...vector]) }));
      store.load();
    },
    remove(name) {
      const file = join(dir, `${slug(name)}.voice`);
      const there = existsSync(file);
      rmSync(file, { force: true });
      store.load();
      return there;
    },
    whose: (vector) => closest(known, vector),
  };
  return store.load();
}

// The enrolled voice most like this voiceprint, and how like it (-1 to 1):
// the average of its likeness to each sample that voice was taught with.
export function closest(prints, vector) {
  let best = { name: null, score: -1 };
  for (const print of prints) {
    let total = 0;
    for (const sample of print.vectors) for (let i = 0; i < vector.length; i++) total += vector[i] * sample[i];
    const score = total / print.vectors.length;
    if (score > best.score) best = { name: print.name, score };
  }
  return best;
}

// One device's own set, on the brain.
export const deviceStore = (device) => voiceStore(join(VOICEPRINTS, "devices", slug(device) || "device"));
