// node --test   (after: node build.mjs)
import assert from "node:assert/strict";
import { test } from "node:test";
import { beatOf, beatsAt, beatsOf, Ear, Follower, LEAD, RATE, tempoOf } from "./index.js";

/** A drum every `period` seconds, at `rate` samples a second. */
function drum(seconds, period, rate) {
  const sound = new Float32Array(Math.round(seconds * rate));
  for (let i = 0; i < sound.length; i++) {
    const since = (i / rate) % period;
    if (since < 0.05) sound[i] = Math.sin(since * 600) * (1 - since / 0.05);
  }
  return sound;
}

test("the constants are the engine's", () => {
  assert.equal(RATE, 100);
  assert.equal(LEAD, 0.08);
});

test("a recording gives its tempo and its beats", () => {
  const rate = 44_100;
  const onsets = new Ear(rate).hear(drum(20, 0.5, rate));
  assert.ok(Math.abs(onsets.length - 20 * RATE) <= 10, `${onsets.length} onsets for 20 s`);

  const beat = tempoOf(onsets);
  assert.ok(Math.abs(beat.bpm - 120) < 1, `read as ${beat.bpm}`);
  assert.ok(beat.sure > 0.3 && beat.catch > 2);
  assert.equal(beat.bpm, 60 / beat.period);

  const beats = beatsOf(onsets, beat.period);
  assert.ok(beats instanceof Float64Array && beats.length >= 36 && beats.length <= 41, `${beats.length} beats`);
  for (const b of beats) {
    const off = ((b + 0.25) % 0.5) - 0.25;
    assert.ok(Math.abs(off) < 0.03, `a beat at ${b}, ${off * 1000} ms from a drum`);
  }

  const short = beatOf(onsets.subarray(0, 12 * RATE));
  assert.ok(Math.abs(short.bpm - 120) < 1);
  const where = beatsAt(onsets, 0.5);
  assert.ok(where.catch > 2 && where.ago >= 0 && where.ago < 0.5);
});

test("sound in pieces is heard as sound in one piece", () => {
  const rate = 48_000;
  const sound = drum(5, 0.4, rate);
  const whole = new Ear(rate).hear(sound);
  const ear = new Ear(rate);
  const pieces = [];
  for (let at = 0; at < sound.length; at += 1000) pieces.push(...ear.hear(sound.subarray(at, at + 1000)));
  assert.deepEqual(Float32Array.from(pieces), whole);
  // And an ear reset hears it again as a new one would.
  ear.reset();
  assert.deepEqual(ear.hear(sound), whole);
  ear.free();
});

test("silence, nothing and nonsense have no beat", () => {
  assert.equal(tempoOf(new Float32Array(3000)), null);
  assert.equal(beatOf([]), null);
  assert.equal(beatsOf([], 0.5).length, 0);
  assert.equal(beatsOf(new Float32Array(3000).fill(NaN), 0.5).length, 0);
  assert.equal(beatsOf(new Ear(8000).hear(drum(10, 0.5, 8000)), NaN).length, 0);
  assert.deepEqual(beatsAt([], 0), { catch: 0, ago: 0 });
});

test("a song is followed as it plays, and rested from", () => {
  const rate = 44_100;
  const sound = drum(60, 60 / 96.7, rate);
  const ear = new Ear(rate);
  const follower = new Follower();
  assert.equal(follower.beat(), null);
  let told = 0;
  for (let i = 0; (i + 1) * (rate / 10) <= sound.length; i++) {
    const now = (i + 1) * 0.1;
    if (!follower.listens(now)) {
      assert.ok(follower.sleeps(now) > 0);
      ear.reset();
      continue;
    }
    assert.equal(follower.sleeps(now), null);
    if (follower.hear(ear.hear(sound.subarray(i * (rate / 10), (i + 1) * (rate / 10))), now)) told++;
  }
  const beat = follower.beat();
  assert.ok(told >= 2, `told ${told} times`);
  assert.ok(Math.abs(beat.bpm - 96.7) / 96.7 < 0.005, `ends at ${beat.bpm}`);
  assert.ok(follower.listened < 40, `listened ${follower.listened} s of 60`);
  follower.moved();
  assert.equal(follower.listens(60), true);
  follower.free();

  const attentive = new Follower({ attentive: true });
  const all = new Ear(rate).hear(sound);
  for (let i = 0; (i + 1) * 10 <= all.length; i++) attentive.hear(all.subarray(i * 10, (i + 1) * 10), (i + 1) * 0.1);
  assert.ok(attentive.listened > 59);
  assert.ok(Math.abs(attentive.beat().bpm - 96.7) / 96.7 < 0.005);
});

test("many ears and followers come and go", () => {
  for (let i = 0; i < 2000; i++) {
    const ear = new Ear(44_100);
    const follower = new Follower();
    ear.hear(new Float32Array(441));
    ear.free();
    follower.free();
  }
  assert.ok(Math.abs(tempoOf(new Ear(22_050).hear(drum(20, 0.5, 22_050))).bpm - 120) < 1);
});
