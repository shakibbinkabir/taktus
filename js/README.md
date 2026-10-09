# taktus

The tempo of music and where its beats fall, from the sound itself, for almost nothing. Try it on a song at [taktus.thisissbk.com](https://taktus.thisissbk.com).

One WebAssembly module of 70 KB (28 KB gzipped) inside the package: no dependency, nothing to fetch or to configure, the same in a browser, a worker, an audio worklet or Node. It is the [Rust engine](https://github.com/shakibbinkabir/taktus) built for the web, and runs at about three quarters of its native speed: a second of sound takes about a third of a millisecond to hear.

```
npm install taktus
```

## A recording

```js
import { Ear, beatsOf, tempoOf } from "taktus";

// Mono samples between -1 and 1, at any rate from 8 kHz up.
const audio = await new AudioContext().decodeAudioData(await (await fetch("song.mp3")).arrayBuffer());
const ear = new Ear(audio.sampleRate);
const onsets = ear.hear(audio.getChannelData(0)); // "how much just started", a hundred values a second

const beat = tempoOf(onsets); // or null, when there is no beat to find
if (beat) {
  console.log(`${beat.bpm.toFixed(1)} beats a minute (sure ${beat.sure.toFixed(2)}, catch ${beat.catch.toFixed(2)})`);
  const beats = beatsOf(onsets, beat.period); // Float64Array: every beat, in seconds from the start
}
```

`sure` is how well the onsets keep the beat's period, from 0 to 1; `catch` is how much of what starts, starts on the beat, where 1 is no more than anywhere else. A reading with `sure` at 0.05 or more and `catch` at 1.0 or more was right 97 to 99 times in 100 on the recordings the engine was measured on, counting half and double tempo as right. A tempo and its half or double are the same beats counted at another level: pass `beat.period * 2` or `beat.period / 2` to `beatsOf` for the other.

For sound in two channels, hear their mean: `left.map((v, i) => (v + right[i]) / 2)`.

## A song as it plays

```js
import { Ear, Follower } from "taktus";

const ear = new Ear(sampleRate);
const follower = new Follower(); // { attentive: true } never rests, and keeps closer to a tempo that wavers

// Every tenth of a second or so, with `now` in seconds on any clock:
function heard(samples, now) {
  if (!follower.listens(now)) {
    ear.reset(); // resting: the sound is not wanted, and its source can be closed
    return;
  }
  if (follower.hear(ear.hear(samples), now)) {
    const beat = follower.beat(); // { bpm, period, at } or null: the time of one beat, on the same clock
    // every other beat is a whole number of periods from `beat.at`
  }
}
```

The follower listens until two readings agree, says so (ten seconds in, typically), confirms on sixteen seconds, then rests and only looks again now and then. Following a song this way it listens to about a quarter of it. After a seek or a pause, call `follower.moved()`; for a new song, make a new follower.

## Everything

| | |
|---|---|
| `new Ear(sampleRate)` | `.hear(samples)` gives a `Float32Array` of onsets; `.reset()` starts over; `.free()` |
| `beatOf(onsets)` | the beat in 8 to 16 seconds of onsets: `{ bpm, period, sure, catch, ago }` or `null` |
| `tempoOf(onsets)` | the same for a long stretch: half a minute, a whole song |
| `beatsOf(onsets, period)` | every beat, as a `Float64Array` of seconds from the start |
| `beatsAt(onsets, period)` | for a tempo known from elsewhere: `{ catch, ago }`, how much its beats catch and how long before the end the last one fell |
| `new Follower({ attentive })` | `.listens(now)`, `.hear(onsets, now)`, `.beat()`, `.sleeps(now)`, `.moved()`, `.listened`, `.free()` |
| `RATE`, `LEAD` | onsets a second (100), and how long after the sound begins the first one comes (0.08 s) |

Samples and onsets may be typed arrays or plain arrays. Types are included. It needs WebAssembly with SIMD: every browser since 2023, Node 18 or later.

How good it is, measured on the field's standard sets and against ten other libraries, is in the [main README](https://github.com/shakibbinkabir/taktus#how-good-it-is).

## Licence, and credit

[Apache License 2.0](https://github.com/shakibbinkabir/taktus/blob/main/LICENSE): free to use, to change and to ship, in anything. It asks for credit: a product that contains this engine keeps its [NOTICE](https://github.com/shakibbinkabir/taktus/blob/main/NOTICE) where its users can find it, which comes to one line:

> This product includes taktus, a tempo and beat engine by Shakib Bin Kabir (https://github.com/shakibbinkabir/taktus).
