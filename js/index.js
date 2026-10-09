// The engine for JavaScript: the WebAssembly build (wasm.js, made by build.mjs
// from src/lib.rs) and the few lines that carry arrays in and out of it.
import { wasm } from "./wasm.js";

const bytes = Uint8Array.from(atob(wasm), (c) => c.charCodeAt(0));
const w = new WebAssembly.Instance(new WebAssembly.Module(bytes), {}).exports;

// The module's memory moves when it grows, and making room may grow it: the
// place is asked for first, the memory looked at after, and no view is kept.
const give = (values) => {
  const at = w.input(values.length);
  new Float32Array(w.memory.buffer, at, values.length).set(values);
  return values.length;
};
const f32 = (count) => {
  const at = w.out_f32();
  return new Float32Array(w.memory.buffer, at, count).slice();
};
const f64 = (count) => {
  const at = w.out_f64();
  return new Float64Array(w.memory.buffer, at, count).slice();
};

const reading = (found) => {
  if (!found) return null;
  const [period, sure, caught, ago] = f64(4);
  return { bpm: 60 / period, period, sure, catch: caught, ago };
};

// An ear or a follower nobody holds any more gives its place back.
const forgotten = new FinalizationRegistry((free) => free());

/** Onset values a second: one every 10 ms. */
export const RATE = w.rate();

/** How long after the sound begins the ear gives its first value, seconds. */
export const LEAD = w.lead();

/** Listens: mono samples in, onsets out, a hundred a second. */
export class Ear {
  #it;
  #rate;

  /** For mono sound at `sampleRate` samples a second (8 kHz and up). */
  constructor(sampleRate) {
    this.#rate = sampleRate;
    this.#it = w.ear_new(sampleRate);
    const it = this.#it;
    forgotten.register(this, () => w.ear_free(it), this);
  }

  /** Samples in (between -1 and 1); the onsets that came of them, one for every 10 ms. */
  hear(samples) {
    return f32(w.ear_hear(this.#it, give(samples)));
  }

  /** As new: for sound that starts again after a gap. */
  reset() {
    w.ear_reset(this.#it, this.#rate);
  }

  /** Gives its memory back now; it is given back anyway once the ear is forgotten. */
  free() {
    forgotten.unregister(this);
    w.ear_free(this.#it);
  }
}

/** The beat in 8 to 16 seconds of onsets, or null. */
export function beatOf(onsets) {
  return reading(w.beat_of(give(onsets)));
}

/** The beat of a long stretch of onsets — half a minute, a whole song — or null. */
export function tempoOf(onsets) {
  return reading(w.tempo_of(give(onsets)));
}

/** Every beat of a stretch already heard, in seconds from its start, `period` seconds apart or so. */
export function beatsOf(onsets, period) {
  return f64(w.beats_of(give(onsets), period));
}

/** Where beats of a known `period` fall: how much they catch, and how long before the end the last one fell. */
export function beatsAt(onsets, period) {
  w.beats_at(give(onsets), period);
  const [caught, ago] = f64(2);
  return { catch: caught, ago };
}

/** Follows a song as it plays, listening only when it is worth it. Times are seconds on any clock. */
export class Follower {
  #it;

  /** `attentive`: never rests, and keeps the beat closer on music whose tempo wavers. */
  constructor({ attentive = false } = {}) {
    this.#it = w.follower_new(attentive ? 1 : 0);
    const it = this.#it;
    forgotten.register(this, () => w.follower_free(it), this);
  }

  /** Whether the sound is wanted at `now`. After a rest, `reset()` the ear. */
  listens(now) {
    return w.follower_listens(this.#it, now) === 1;
  }

  /** Seconds until the sound is wanted again; null while listening. */
  sleeps(now) {
    const rest = w.follower_sleeps(this.#it, now);
    return rest < 0 ? null : rest;
  }

  /** Onsets heard, the last of them at `now`. True when the beat changed. */
  hear(onsets, now) {
    return w.follower_hear(this.#it, give(onsets), now) === 1;
  }

  /** The beat as known: its tempo, seconds from one beat to the next, and the time of one. Or null. */
  beat() {
    if (!w.follower_beat(this.#it)) return null;
    const [period, at] = f64(2);
    return { bpm: 60 / period, period, at };
  }

  /** The song went somewhere else (a seek, a pause): the tempo holds, its beats are found again. */
  moved() {
    w.follower_moved(this.#it);
  }

  /** Seconds listened in all. */
  get listened() {
    return w.follower_listened(this.#it);
  }

  /** Gives its memory back now; it is given back anyway once the follower is forgotten. */
  free() {
    forgotten.unregister(this);
    w.follower_free(this.#it);
  }
}
