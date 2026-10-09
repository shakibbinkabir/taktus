# The comparison, to run again

What produced the tables under "Against other engines" in the main README: this engine and ten other libraries on five public sets, judged by one script. The per-file results behind the published tables are attached to the release they were published with (`results.zip`); unpacked into `compare/results/`, `python table.py` prints the tables from them without running anything.

Everything here is Python 3.10+ with NumPy, plus whichever libraries you want to run.

## The sets

One folder, named by `BEAT_SETS` (default `./sets`), laid out like this. All sound is 16-bit WAV.

| Folder | What goes in it | From |
|---|---|---|
| `ballroom/BallroomData/` | the 698 excerpts, in their genre folders | the ISMIR 2004 tempo contest (Ballroom) |
| `ballroom/beats/` | `*.beats` | [CPJKU/BallroomAnnotations](https://github.com/CPJKU/BallroomAnnotations) |
| `gtzan/genres/` | the 1,000 excerpts, in their genre folders, as WAV | GTZAN |
| `gtzan/beats/` | `gtzan_<genre>_<number>.beats` | [TempoBeatDownbeat/gtzan_tempo_beat](https://github.com/TempoBeatDownbeat/gtzan_tempo_beat) |
| `giantsteps/wav/` | the 664 two-minute excerpts, converted (`ffmpeg -i x.mp3 -ac 1 -ar 22050 x.wav`) | [GiantSteps/giantsteps-tempo-dataset](https://github.com/GiantSteps/giantsteps-tempo-dataset) |
| `giantsteps/tempo/`, `giantsteps/tempo_v2/` | `*.bpm`; the second holds the corrected annotations and wins | the same repository (`annotations/tempo`, `annotations_v2/tempo`) |
| `hainsworth/wavs/` | the 222 excerpts | the Hainsworth set |
| `hainsworth/beats/` | `hainsworth_<number>.beats` | [superbock/ISMIR2019](https://github.com/superbock/ISMIR2019) |
| `smc/audio/` | the 217 excerpts | SMC_MIREX |
| `smc/beats/` | `SMC_<number>_….txt` | the set's own annotations (05_08_2014) |

Where beats are annotated, the tempo is 60 over the median gap between them. Left out: one GTZAN excerpt with no usable annotation (`reggae.00086`) and one whose file cannot be read (`jazz.00054`), and three Giantsteps excerpts with no tempo annotated. That leaves 698, 998, 661, 222 and 217.

## This engine

```
cargo run --release --example eval -- $BEAT_SETS/ballroom/BallroomData > compare/results/engine.ballroom.jsonl
```

and the same for `gtzan/genres`, `giantsteps/wav`, `hainsworth/wavs` and `smc/audio`. Each line holds the whole-excerpt tempo (`tempo_of`), every beat (`beats_of`), and what the follower made of the excerpt as it played.

## The others

```
python rival.py librosa            # every set
python rival.py madmom gtzan smc   # some
WORKERS=0/4 python rival.py beat_this &   # four processes sharing a set: 0/4, 1/4, 2/4, 3/4
PART=40 python rival.py beatnet    # about 40 files of each set, evenly spread
```

`rival.py` knows `librosa`, `aubio`, `essentia`, `essentia_percival`, `pyaudioanalysis`, `madmom`, `beat_this`, `beatnet` and `deeprhythm`, each called the way its own documentation or example does. What was installed for the published run:

```
pip install librosa soundfile aubio-ledfx essentia
pip install pyAudioAnalysis hmmlearn eyed3 pydub imbalanced-learn plotly matplotlib scikit-learn tqdm
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
pip install git+https://github.com/CPJKU/madmom https://github.com/CPJKU/beat_this/archive/main.zip
pip install cython PyAudio BeatNet deeprhythm
```

Two are not Python:

- **BTrack** (C++). `btrack_run.cpp` reads file paths on its input and prints the same JSON lines.
  ```
  git clone --depth 1 https://github.com/adamstark/BTrack.git src
  gcc -O2 -c src/libs/kiss_fft130/kiss_fft.c
  g++ -O2 -std=c++17 -DUSE_KISS_FFT -I src/src -I src/libs/kiss_fft130 btrack_run.cpp src/src/BTrack.cpp src/src/OnsetDetectionFunction.cpp kiss_fft.o -lsamplerate -o btrack_run
  find $BEAT_SETS/gtzan/genres -name '*.wav' | sort | ./btrack_run > results/btrack.gtzan.jsonl
  ```
- **TarsosDSP** (Java). `tarsos/Run.java` walks a folder, with `core-2.5.jar` and `jvm-2.5.jar` from TarsosDSP's releases beside it.
  ```
  javac -cp core-2.5.jar:jvm-2.5.jar Run.java
  java -cp core-2.5.jar:jvm-2.5.jar:. Run $BEAT_SETS/gtzan/genres ../results/tarsosdsp.gtzan.jsonl
  ```

## The tables

```
python table.py
```

Accuracy1 is a tempo within 4% of the annotated one; Accuracy2 also accepts twice, three times, half or a third of it; beats are scored by F-measure with a 70 ms window (`sets.py` has all three). A library that ran only part of a set is scored on that part, and this engine on the very same files beside it.

## What each costs

On a machine doing nothing else, the same twenty GTZAN excerpts through each:

```
python cost.py aubio
python cost.py run "this engine" ../target/release/examples/tempo
python cost.py feed btrack ./btrack_run
python cost.py folder tarsosdsp java -cp core-2.5.jar:jvm-2.5.jar:tarsos Run {} results/tarsos.cost.jsonl
```

Timings taken while anything else is running are worthless: on the laptop these were measured on, a busy machine inflated them two- to five-fold.

## What was run, and what was not

The published tables were run in October 2026 on Windows 11 (Essentia and BTrack in a Linux container on the same machine) with librosa 1.0.0, aubio 0.4.12, Essentia 2.1b6, pyAudioAnalysis 0.3.14, madmom 0.17.dev0, beat_this 1.1.0 (`final0`), BeatNet 1.1.1 (model 1) and DeepRhythm 0.0.13. For what they cost to run, madmom and beat_this were given every fourth Giantsteps excerpt, beat_this 40 excerpts of Hainsworth and of SMC, BeatNet 40 of each of four sets, and Essentia's Percival method three sets and 51 excerpts of SMC. web-audio-beat-detector runs only in a browser and was not run.
