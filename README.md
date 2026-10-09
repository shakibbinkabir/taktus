# taktus

[![crates.io](https://img.shields.io/crates/v/taktus.svg)](https://crates.io/crates/taktus)
[![docs.rs](https://docs.rs/taktus/badge.svg)](https://docs.rs/taktus)
[![npm](https://img.shields.io/npm/v/taktus.svg)](https://www.npmjs.com/package/taktus)
[![CI](https://github.com/shakibbinkabir/taktus/actions/workflows/ci.yml/badge.svg)](https://github.com/shakibbinkabir/taktus/actions/workflows/ci.yml)

The tempo of music and where its beats fall, from the sound itself, for almost nothing.

**[taktus.thisissbk.com](https://taktus.thisissbk.com)**: drop a song on the page and see its beat, in your browser.

One Rust file, no dependency, no `unsafe`. Sound goes in sample by sample; a tempo and the time of every beat come out. It is built to run beside something else — a visualiser, a game, a light show — without being noticed: under a hundredth of a percent of one core, and about nine kilobytes of memory while it listens.

- **For a recording**: its tempo, how far to trust it, and every beat.
- **For a song as it plays**: the beat within about ten seconds, then kept by listening to a quarter of the sound.
- **Measured** on the field's five standard sets against ten other libraries: ahead of every one that is not a neural network, on average, for tempo and for beats, at a third of the processor time of the fastest. Two neural beat trackers place beats better, for several hundred times the cost. [Every number is below](#against-other-engines), with what it does not show.
- **Also for JavaScript**: the same engine as one WebAssembly module of 70 KB (28 KB gzipped), with nothing to load beside it.

## Install

```
cargo add taktus        # Rust 1.88 or later
npm install taktus      # browsers and Node 18 or later
```

## What it does

```rust
use taktus::{beat_of, beats_of, tempo_of, Ear, Follower};

// 1. Sound → "how much just started", a hundred values a second.
let mut ear = Ear::new(48_000);
let onsets: Vec<f32> = samples.iter().filter_map(|s| ear.hear(*s)).collect();

// 2. Those → the beat. `beat_of` reads one stretch (8 to 16 seconds is its
//    range); `tempo_of` reads a long one — half a minute, a whole song — by
//    pooling many short readings.
if let Some(beat) = tempo_of(&onsets) {
    println!("{:.1} bpm, sure {:.2}, last beat {:.3} s before the end", beat.bpm(), beat.sure, beat.ago);
}

// 3. Every beat of a stretch already heard, in seconds from its start. The
//    period is yours to give: half or double it counts the music at another level.
let beats: Vec<f64> = tempo_of(&onsets).map_or(Vec::new(), |beat| beats_of(&onsets, beat.period));

// 4. Or follow a song as it plays, listening only when it is worth it.
let mut follower = Follower::default();
// every tenth of a second, with `now` in seconds on your own clock:
if follower.listens(now) {
    let heard: Vec<f32> = chunk.iter().filter_map(|s| ear.hear(*s)).collect();
    if follower.hear(&heard, now) {
        // Some((seconds per beat, the time of one beat)) — or None: it lost it.
        let beat = follower.beat();
    }
}
```

`Follower` listens until two readings agree, tells you at once (ten seconds in, typically), confirms on a full sixteen seconds, then rests and only looks again now and then; each look says more exactly how long a beat is. Set `follower.attentive = true` and it never rests: the beat stays closer on music whose tempo wavers, for the price of the ear running all the time.

Sound is mono samples between -1 and 1, at any rate from 8 kHz up; mix the channels of each frame into one before `hear`. The [documentation](https://docs.rs/taktus) has both uses as complete programs, and `cargo run --release --example tempo -- song.wav` reads a file.

### In JavaScript

```js
import { Ear, beatsOf, tempoOf } from "taktus";

const ear = new Ear(audioBuffer.sampleRate);
const onsets = ear.hear(audioBuffer.getChannelData(0)); // mono samples in, onsets out
const beat = tempoOf(onsets);                            // { bpm, period, sure, catch, ago } or null
const beats = beat ? beatsOf(onsets, beat.period) : [];  // seconds from the start
```

The whole of the above, `Follower` included, with TypeScript types: [js/README.md](js/README.md).

## How good it is

Measured on the three standard sets of the field, with its two standard measures: **Accuracy1** (the tempo within 4% of the annotated one) and **Accuracy2** (the same, also accepting twice, three times, half or a third of it). Tempi for Ballroom and GTZAN are taken from their beat-by-beat annotations. librosa 1.0's beat tracker is run on the same files as a yardstick.

### Tempo of a whole excerpt (`tempo_of`)

| Set | Excerpts | | Accuracy1 | half or double too | Accuracy2 |
|---|---|---|---|---|---|
| Ballroom (dance music, 30 s) | 698 | this engine | **77.4%** | 98.7% | **99.0%** |
| | | librosa | 64.0% | 89.4% | 90.1% |
| GTZAN (ten genres, 30 s) | 998 | this engine | **74.5%** | 93.8% | **95.1%** |
| | | librosa | 69.8% | 88.0% | 89.0% |
| Giantsteps (electronic, 2 min) | 661 | this engine | **81.5%** | 95.9% | **95.9%** |
| | | librosa | 36.8% | 52.3% | 52.3% |

On GTZAN most of what is missed is classical (seven excerpts in ten right), where there is often no steady beat to find; jazz (92%) and blues (96%) come next, and the other seven genres are at 97–100%.

### Following a song live (`Follower`)

It claims a beat only when it is sure enough; the right-hand columns are how often a claim is right (Accuracy2).

| Set | claims a beat on | right when it claims | attentive: right when it claims |
|---|---|---|---|
| Ballroom | 97% | 99.1% | 99.6% |
| GTZAN | 91% | 98.0% | 98.4% |
| Giantsteps | 99% | 95.3% | 94.8% |

### Its own confidence

Every reading says how sure it is (`sure`, `catch`). Keeping only whole-excerpt readings with `sure >= 0.05` and `catch >= 1.0`:

| Set | answers on | right (Accuracy2) |
|---|---|---|
| Ballroom | 93% | 99.2% |
| GTZAN | 82% | 99.2% |
| Giantsteps | 95% | 97.3% |

So "right 99 times in 100 when it says it is sure" holds on two of the three sets. On electronic music it is 97: there a rhythm laid across the beat can fit very convincingly.

### On sets it was never tuned on

Every setting above was chosen while looking at those three sets. These two were run once, after all settings were fixed, and nothing was changed afterwards: Hainsworth (222 excerpts of about a minute: rock and pop, jazz, dance, classical, choral, folk; tempi from the revised beat annotations) and SMC (217 excerpts of 40 s chosen for being hard: rubato, sparse, no drums).

| Set | | Accuracy1 | Accuracy2 | follower claims a beat on | right when it claims (Accuracy2) | attentive |
|---|---|---|---|---|---|---|
| Hainsworth | this engine | **70.3%** | **88.7%** | 85% | 95.7% | 97.3% |
| | librosa | 67.1% | 85.1% | | | |
| SMC | this engine | **27.6%** | **48.4%** | 26% | 75.0% | 90.7% |
| | librosa | 14.3% | 30.9% | | | |

On Hainsworth the misses are choral and classical music without a steady beat (choral: 36% Accuracy2) and, for Accuracy1, excerpts the annotators counted at half the engine's tempo (15% of the set). Kept to `sure >= 0.05` and `catch >= 1.0`, the whole-excerpt reading answers on 62% of Hainsworth and is right 97.1% of the time; on SMC it answers on 20% and is right 84.1%. The 16-second gate the follower acts on (`sure >= 0.10`, `catch >= 1.2`) is right 97.6% of the time on Hainsworth and 86.8% on SMC, against 99.0–99.5% on the two sets it was set on.

Where the beats fall, F-measure within 70 ms from the moment the follower claims a beat: Hainsworth 0.60 resting, **0.74** attentive (librosa, hearing the whole excerpt first: 0.69); SMC 0.45 resting, 0.56 attentive (librosa 0.34).

### Where the beats fall

The follower's beats against the annotated ones, within 70 ms (F-measure), from the moment it claims a beat:

| Set | resting follower | attentive follower | librosa (hears the whole excerpt first) |
|---|---|---|---|
| Ballroom | 0.70 (0.84 at some level) | **0.78** (0.87) | 0.70 (0.81) |
| GTZAN | 0.70 (0.82) | **0.80** (0.86) | 0.75 (0.83) |

"At some level" also accepts the same beats counted at half or double speed or on the off-beat. The beats are centred within 5 ms of the annotations.

Every beat of an excerpt already heard (`beats_of`), by the same measure, over every excerpt of each set, sure or not:

| Set | at the engine's own tempo | handed the annotated tempo |
|---|---|---|
| Ballroom | **0.820** | 0.884 |
| GTZAN | **0.808** | 0.874 |
| Hainsworth | **0.743** | 0.791 |
| SMC | **0.441** | 0.535 |

The right-hand column is the tracker's ceiling. Most of the gap is the choice of level and not the stepping: where the engine's beats are not the annotated ones, they are most often the same beats counted twice or half as fast (about a fifth of the excerpts of the first three sets), then the off-beat (3–6%).

### What these numbers are not

- **Not 99% exact.** The exact tempo is right three or four times in five; with half and double allowed, 89–99%. Whether a song "is" 85 or 170 is partly convention: on every set the engine reads some excerpts at double the annotation and others at half, so no tempo preference fixes both ends. What decides it here is one number, the tempo taken as usual (135 beats a minute): raising it from 125 gained twelve points of Accuracy1 on electronic music and lost one on GTZAN, and on Hainsworth 120 would score three points more and 150 seven points less. Three small learned rules were also tried for it, and none survived a test on data it had not learned from; nor did deciding half against double by how well each fits, widening the range past 200 BPM, or changing how many multiples of a period must line up. The exact tempo is among the engine's own candidates on 89–99% of excerpts; choosing among them is what is hard. For scale, the best published systems on the tempo_eval benchmark (neural networks trained on these very sets, cross-validated) reach Accuracy1 / Accuracy2 of about 94 / 96 on Ballroom, 88 / 95 on GTZAN, 90 / 98.5 on Giantsteps, 86 / 94 on Hainsworth and 57 / 70 on SMC. No published system reaches 99% on either measure on any of these sets.
- **Not independent of the sets.** Every setting was chosen looking at one or more of the three. The one result from before a set was looked at: the first Giantsteps run, 65.8% / 90.8%, with settings from the other two. The Hainsworth and SMC results above are the only ones on data never looked at. (Both were looked at afterwards, for the trials listed next; no setting was changed.)
- **Not for want of trying the cheap things.** Measured on all five sets and not kept, because each did nothing or traded one set against another: a bass-drum cue to tell the beat from the off-beat (the low bands turn out to be the least telling of all); a usual tempo that depends on how machine-steady the pulse is (−0.1 points of Accuracy1 on sets it was not chosen on); a usual-tempo curve drawn from the annotated tempi themselves (9 points of Accuracy1 worse: the single bump at 135 also offsets the comb's lean toward slow periods, which a true histogram does not); 16 to 96 bands in the ear, bands spaced with a knee, and high or low bands counting for more (finer bands help pitched music, +0.03 of beat F-measure on Hainsworth at 40 bands, and cost dance music 0.4 to 0.8 points of Accuracy1 on Ballroom and Giantsteps); two ears with different bands, keeping the surer reading (+1.0 points of Accuracy2 and −0.5 of Accuracy1, for twice the reading).
- **Not independent of the annotations.** Ballroom's 99.0% Accuracy2 is against tempi taken from the beat-by-beat annotations; against the set's original 2006 tempo files, which disagree with those on 27 of the 698 excerpts, it is 75.4% / 95.6% (librosa 61.3% / 86.0%).
- **Not a beat tracker for every music.** Classical, rubato, and swing or triplet feels (blues, jazz) are where it is wrong or declines.

## Against other engines

Ten of the most used open-source libraries that give a tempo or beats, each run the way its own documentation or example does, on the same files, judged by the same script (October 2026). Six are signal processing, like this engine; DeepRhythm is a neural tempo classifier; madmom, beat_this and BeatNet are neural beat trackers that come with trained weights. Where a library gives beats and no tempo, its tempo is 60 over the median gap between its beats.

### Tempo

Accuracy1 / Accuracy2, in percent.

| | Ballroom | GTZAN | Giantsteps | Hainsworth | SMC | mean |
|---|---|---|---|---|---|---|
| **this engine** | **77.4 / 99.0** | **74.5 / 95.1** | **81.5 / 95.9** | **70.3 / 88.7** | **27.6 / 48.4** | **66.3 / 85.4** |
| Essentia (multifeature) | 71.2 / 96.3 | 73.7 / 93.4 | 59.9 / 83.2 | 74.8 / 90.5 | 17.5 / 47.0 | 59.4 / 82.1 |
| Essentia (Percival) | 65.0 / 92.1 | 66.0 / 90.3 | – | 69.8 / 86.5 | 13.7 / 27.5† | – |
| BTrack | 60.5 / 88.5 | 67.9 / 88.2 | 62.2 / 85.0 | 70.3 / 84.7 | 15.2 / 30.9 | 55.2 / 75.5 |
| TarsosDSP | 64.3 / 93.3 | 62.6 / 90.5 | 73.7 / 82.1 | 57.2 / 83.8 | 6.5 / 30.9 | 52.9 / 76.1 |
| aubio | 59.7 / 77.8 | 64.8 / 85.4 | 61.7 / 71.9 | 67.6 / 81.5 | 10.6 / 26.3 | 52.9 / 68.6 |
| librosa | 64.0 / 90.1 | 69.8 / 89.0 | 36.8 / 52.3 | 67.1 / 85.1 | 14.3 / 30.9 | 50.4 / 69.5 |
| pyAudioAnalysis | 32.8 / 62.2 | 31.3 / 53.9 | 36.0 / 43.6 | 29.7 / 50.9 | 3.7 / 21.2 | 26.7 / 46.4 |
| DeepRhythm (neural) | 64.9 / 91.7 | 68.9 / 92.5 | 71.3 / 98.5 | 73.4 / 88.3 | 19.8 / 41.9 | 59.7 / 82.6 |
| BeatNet (neural) | 90.0 / 100.0† | 80.0 / 92.5† | – | 80.0 / 82.5† | 20.0 / 37.5† | – |
| madmom (neural) | 85.2 / 100.0‡ | 78.4 / 95.7 | 67.7 / 93.9† | 82.9 / 94.6‡ | 44.7 / 67.3‡ | 71.8 / 90.3† |
| beat_this (neural) | 99.9 / 99.9‡ | 82.1 / 94.1 | 81.7 / 92.1† | 97.5 / 100.0†‡ | 77.5 / 80.0†‡ | 87.7 / 93.2† |

† Run on part of the set, for what these cost to run: every fourth Giantsteps excerpt (164) for madmom and beat_this; 40 excerpts of Hainsworth and of SMC for beat_this; 40 of each set for BeatNet; 51 of SMC for Essentia's Percival method. This engine on those very files: Giantsteps 80.5 / 92.7; Hainsworth 65.0 / 85.0; SMC 20.0 / 50.0; BeatNet's part of Ballroom 85.0 / 95.0 and of GTZAN 72.5 / 97.5.

‡ The library's network was trained on this set: madmom on Ballroom, Hainsworth and SMC; beat_this on every set its authors had except GTZAN, and they say themselves that its results on those are unfairly good. GTZAN and Giantsteps are the two sets neither has seen.

### Beats

F-measure within 70 ms; `beats_of` for this engine.

| | Ballroom | GTZAN | Hainsworth | SMC | mean |
|---|---|---|---|---|---|
| **this engine** | **0.820** | **0.808** | **0.743** | **0.441** | **0.703** |
| Essentia (multifeature) | 0.764 | 0.775 | 0.741 | 0.372 | 0.663 |
| TarsosDSP | 0.788 | 0.751 | 0.681 | 0.321 | 0.635 |
| librosa | 0.700 | 0.753 | 0.685 | 0.335 | 0.618 |
| BTrack | 0.653 | 0.692 | 0.666 | 0.268 | 0.570 |
| aubio | 0.633 | 0.640 | 0.620 | 0.268 | 0.540 |
| BeatNet (neural) | 0.913† | 0.791† | 0.814† | 0.377† | 0.724† |
| madmom (neural) | 0.910‡ | 0.870 | 0.904‡ | 0.563‡ | 0.812 |
| beat_this (neural) | 0.983‡ | 0.887 | 0.974†‡ | 0.704†‡ | 0.887† |

On the files BeatNet and beat_this were run on (†), this engine scores 0.827 (Ballroom), 0.790 (GTZAN), 0.720 (Hainsworth) and 0.399 (SMC).

### Cost and size

The same twenty 30-second excerpts through each, on one thread of an idle laptop (Intel i7-1260P): the time from the file to a tempo and every beat, the most memory the process held, and how long it takes to be ready (imports, weights, whatever its first call compiles; not counted in the time).

| | ms per second of sound | times this engine | most memory | ready after | what it needs | licence |
|---|---|---|---|---|---|---|
| **this engine** | **0.4** | 1 | **8 MB** | at once | nothing: one Rust file | Apache-2.0 |
| aubio | 1.3 | 3 | 37 MB | 0.1 s | a C library | GPL-3.0 |
| librosa | 2.3 | 6 | 213 MB | 2.9 s | NumPy, SciPy, Numba, scikit-learn | ISC |
| TarsosDSP | 4.2 | 10 | 242 MB | – | a Java runtime | GPL-3.0 |
| BTrack | 7.7 | 19 | 34 MB | – | C++, libsamplerate, FFTW or KissFFT | GPL-3.0 |
| BeatNet | 8.1 | 20 | 352 MB | 3.0 s | PyTorch, madmom, librosa | CC BY 4.0 |
| DeepRhythm | 9.9 | 25 | 425 MB | 3.7 s | PyTorch, librosa, nnAudio; 5 MB of weights | AGPL-3.0 |
| pyAudioAnalysis | 13.4 | 34 | 142 MB | 1.9 s | NumPy, SciPy, scikit-learn | Apache-2.0 |
| Essentia (Percival) | 17.3 | 43 | 162 MB | 1.3 s | Essentia (38 MB) | AGPL-3.0 |
| Essentia (multifeature) | 24.8 | 62 | 187 MB | 1.7 s | Essentia (38 MB) | AGPL-3.0 |
| madmom | 138 | 350 | 289 MB | 5.4 s | NumPy, SciPy; 28 MB of models | BSD, models CC BY-NC-SA |
| beat_this | 196 | 490 | 430 MB | 7.7 s | PyTorch; 77 MB of weights | MIT |

The engine's figures are its `tempo` example's: the 8 MB are that program and the file it had just read, and what the engine itself holds is in the next section. The Python figures include the interpreter. Essentia and BTrack ran in a Linux container on the same machine. This is the cost of reading a file from end to end; following a song as it plays costs this engine about a fifth of that, since it rests (next section).

### What these tables say

- **Of the six signal-processing libraries, none is ahead on the five-set mean, for tempo or for beats.** Set by set there is one exception: Essentia's tempo on Hainsworth (74.8 / 90.5 against 70.3 / 88.7), where BTrack also ties on Accuracy1.
- **DeepRhythm** is behind on the mean and ahead on two cells: Accuracy2 on Giantsteps (98.5 against 95.9) and Accuracy1 on Hainsworth (73.4 against 70.3).
- **madmom and beat_this place beats better, everywhere.** On GTZAN, which neither was trained on, 0.870 and 0.887 against 0.808. For tempo on the two sets they have not seen it is closer, and not all one way: on GTZAN 78.4 / 95.7 (madmom) and 82.1 / 94.1 (beat_this) against 74.5 / 95.1; on the same 164 Giantsteps excerpts 67.7 / 93.9 and 81.7 / 92.1 against 80.5 / 92.7.
- **BeatNet**, on 40 excerpts of each set (what it was trained on was not checked): ahead on Ballroom and Hainsworth, level on GTZAN (beats 0.791 against 0.790; tempo 80.0 / 92.5 against 72.5 / 97.5), behind on SMC (beats 0.377 against 0.399).
- **madmom and beat_this do it for some 350 and 500 times the processor time** and 290 to 430 MB of memory, on NumPy and SciPy or PyTorch. Nothing here is within a factor of three of this engine's cost, and only aubio, a C library, stands on its own as this does.

How each was run: librosa 1.0 `beat.beat_track`; aubio 0.4.12 `tempo("default", 1024, 512)`; Essentia 2.1b6 `RhythmExtractor2013(method="multifeature")` and `PercivalBpmEstimator`; BTrack with a hop of 512 and a frame of 1024 at 44.1 kHz; TarsosDSP 2.5 `ComplexOnsetDetector` into `BeatRoot`, as its beat-extraction example; pyAudioAnalysis 0.3.14 `beat_extraction` on 50 ms features; madmom 0.17 `RNNBeatProcessor` into `TempoEstimationProcessor` and `DBNBeatTrackingProcessor`; beat_this 1.1 `File2Beats("final0")` on the processor; BeatNet 1.1.1 model 1, offline, with its DBN; DeepRhythm 0.0.13 `predict`. web-audio-beat-detector runs only in a browser and was not run.

## What it costs

On one core of a laptop CPU (Intel i7-1260P), release build:

| | |
|---|---|
| The ear, while listening | about 0.26 ms per second of sound (0.026% of a core) |
| A reading of 16 s of onsets | 0.27 ms |
| The tempo and every beat of a 30-second excerpt already heard | 1.9 ms |
| Following a 3½-minute song, resting between looks | listens to 25% of it; about 14 ms of work in all: **0.007% of a core** |
| The same, attentive | about 0.03% of a core |
| Memory | the ear 2,408 bytes, the follower 136 bytes plus up to 6,400 bytes of onsets while it listens, 6.5 KB of tables shared by all; a reading borrows a few tens of kilobytes for the fraction of a millisecond it takes |
| In a program | about 54 KB of compiled code, from some 570 lines of Rust (900 with their comments) |

## How it works

1. **The ear.** The sound is thinned to about 12 kHz. Every 10 ms, the last 43 ms are turned into a spectrum (a 512-point transform done at half size, since sound is real numbers), summed into 24 bands each wider than the last, and put on a log scale. Each band is compared with itself 30 ms before — a soft instrument takes that long to speak — and the rises, added up, are "how much just started".
2. **The reading.** Those values minus their own surroundings; how alike they are to themselves at every lag (autocorrelation); then, for every period from 200 to 60 beats a minute, the geometric mean of that likeness at the period and its next five multiples — one multiple that does not line up is enough to rule a period out, which is what tells a beat from two thirds of it. The best few are weighed by how usual their tempo is (around 135, loosely). Between two candidates four-to-three apart that weighing has no say: the one the onsets fit and fall on better wins.
3. **A long stretch.** Sixteen-second readings every four seconds vote, each counting for how well it fits: a tempo that wavers blurs one long reading but not the vote of short ones. The long reading still says which level is the beat when it is that pulse's own.
4. **Where the beats fall.** The onsets folded onto one period: where they gather is the beat, placed within its 20 ms cell by the balance of its neighbours, less the 22 ms the ear is late by.
5. **Every beat of a stretch.** With the tempo known, of all the ways of stepping through the onsets about one period at a time, the one that lands on the most that starts while keeping its steps even (dynamic programming, after Ellis 2007). It bends with a tempo that drifts.
6. **Following.** A reading every two seconds from eight; two that agree and are clear enough are told; sixteen seconds settle it. Then short looks near the known tempo — a beat found where it was due confirms the tempo over all the beats since, which is how it gets exact to a few hundredths of a beat a minute — and every second look is long and read afresh, so a beat found wrong in a song's opening bars is found out.

## Checking it yourself

```
cargo test                                         # 11 tests and the documentation's two programs; no data needed
cargo run --release --example tempo -- song.wav    # the tempo and beats of a 16-bit WAV
cargo run --release --example bench                # speed and memory
cargo run --release --example latency              # where it places clicks at known times
cargo run --release --example eval -- <folder>     # every 16-bit WAV under a folder, one JSON line each
BEAT_ATTENTIVE=1 cargo run --release --example eval -- <folder>
```

[compare/](compare/) has what ran the other libraries and printed the tables above, and says where each set comes from and how to lay it out.

The sets: Ballroom (ISMIR 2004 tempo contest, beats from CPJKU/BallroomAnnotations), GTZAN (tempo and beats from TempoBeatDownbeat/gtzan_tempo_beat), Giantsteps tempo (GiantSteps/giantsteps-tempo-dataset, corrected annotations where it has them), Hainsworth and SMC (beats from superbock/ISMIR2019; SMC's own 2014 annotations give the same tempi). Tempo is 60 over the median gap between annotated beats; Accuracy1 is within 4% of it, Accuracy2 also accepts 2, 3, ½ and ⅓ times it.

## Contributing

Issues and pull requests are welcome. A change to how the engine hears or reads comes with its numbers: the five sets before and after, from `compare/`, since most ideas that help one set cost another (the list of those already tried is under [What these numbers are not](#what-these-numbers-are-not)). `cargo fmt`, `cargo clippy --all-targets` and `cargo test` should stay quiet.

## Licence, and credit

Free to use, to change and to ship, in anything, under the [Apache License 2.0](LICENSE) — which asks one thing that matters here: **credit**. Whoever distributes this engine, or a product that contains it, must keep the [NOTICE](NOTICE) with it: in a notice file, in the documentation, or wherever the product lists what it is built with. That is one line where your users can find it:

> This product includes taktus, a tempo and beat engine by Shakib Bin Kabir (https://github.com/shakibbinkabir/taktus).

A mention in your README or on your credits screen is the same thing done well.
