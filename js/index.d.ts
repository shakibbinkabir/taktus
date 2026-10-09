/** Samples or onsets: a typed array, or any list of numbers. */
export type Numbers = ArrayLike<number>;

/** A beat found in a stretch of onsets. */
export interface Beat {
  /** The tempo, in beats a minute. */
  bpm: number;
  /** Seconds from one beat to the next. */
  period: number;
  /** How well the onsets keep that period, 0 to 1. */
  sure: number;
  /** How much of what starts, starts on those beats (1 = no more than anywhere else). */
  catch: number;
  /** Seconds from the last beat to the end of the stretch. */
  ago: number;
}

/** Onset values a second: one every 10 ms. */
export const RATE: number;

/** How long after the sound begins the ear gives its first value, seconds. */
export const LEAD: number;

/** Listens: mono samples in, onsets out, a hundred a second. */
export class Ear {
  /** For mono sound at `sampleRate` samples a second (8 kHz and up). */
  constructor(sampleRate: number);
  /** Samples in (between -1 and 1); the onsets that came of them, one for every 10 ms. */
  hear(samples: Numbers): Float32Array;
  /** As new: for sound that starts again after a gap. */
  reset(): void;
  /** Gives its memory back now; it is given back anyway once the ear is forgotten. */
  free(): void;
}

/** The beat in 8 to 16 seconds of onsets, or null. */
export function beatOf(onsets: Numbers): Beat | null;

/** The beat of a long stretch of onsets — half a minute, a whole song — or null. */
export function tempoOf(onsets: Numbers): Beat | null;

/** Every beat of a stretch already heard, in seconds from its start, `period` seconds apart or so. */
export function beatsOf(onsets: Numbers, period: number): Float64Array;

/** Where beats of a known `period` fall: how much they catch, and how long before the end the last one fell. */
export function beatsAt(onsets: Numbers, period: number): { catch: number; ago: number };

/** Follows a song as it plays, listening only when it is worth it. Times are seconds on any clock. */
export class Follower {
  /** `attentive`: never rests, and keeps the beat closer on music whose tempo wavers. */
  constructor(options?: { attentive?: boolean });
  /** Whether the sound is wanted at `now`. After a rest, `reset()` the ear. */
  listens(now: number): boolean;
  /** Seconds until the sound is wanted again; null while listening. */
  sleeps(now: number): number | null;
  /** Onsets heard, the last of them at `now`. True when the beat changed. */
  hear(onsets: Numbers, now: number): boolean;
  /** The beat as known: its tempo, seconds from one beat to the next, and the time of one. Or null. */
  beat(): { bpm: number; period: number; at: number } | null;
  /** The song went somewhere else (a seek, a pause): the tempo holds, its beats are found again. */
  moved(): void;
  /** Seconds listened in all. */
  readonly listened: number;
  /** Gives its memory back now; it is given back anyway once the follower is forgotten. */
  free(): void;
}
