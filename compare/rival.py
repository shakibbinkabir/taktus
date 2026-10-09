"""One library over the benchmark sets: for every file its tempo, its beats if it gives any,
and how long it took. One JSON line per file in results/<library>.<set>.jsonl; a run that
stops can be started again where it stopped.

    python rival.py <library> [set ...]

    WORKERS=i/n   this process takes every n-th file, starting at the i-th, and writes its own part
    THREADS=n     threads a neural library may use (default 1)
    PART=n        about n files of each set, evenly spread, for a library too slow for all of them
"""
import glob
import json
import os
import sys
import time
import wave

import numpy as np

import sets

WORKER, WORKERS = (int(v) for v in os.environ.get("WORKERS", "0/1").split("/"))
THREADS = int(os.environ.get("THREADS", "1"))
PART = int(os.environ.get("PART", "0"))


def read_wav(path):
    """Samples a second and mono samples of a 16-bit WAV."""
    with wave.open(path, "rb") as w:
        x = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float32) / 32768.0
        if w.getnchannels() > 1:
            x = x.reshape(-1, w.getnchannels()).mean(axis=1)
        return w.getframerate(), x


def from_beats(beats):
    """A tempo for a library that gives beats and no tempo: 60 over their median gap."""
    beats = np.asarray(beats, dtype=float)
    tempo = 60.0 / float(np.median(np.diff(beats))) if len(beats) > 2 else 0.0
    return tempo, [round(float(b), 4) for b in beats]


def make(library):
    """The library's own documented way from a file to a tempo (and beats)."""
    if library == "librosa":
        import librosa

        def run(path):
            y, sr = librosa.load(path, sr=None, mono=True)
            tempo, beats = librosa.beat.beat_track(y=y, sr=sr, units="time")
            return float(np.atleast_1d(tempo)[0]), [round(float(b), 4) for b in np.atleast_1d(beats)]

        return run
    if library == "aubio":
        import aubio

        def run(path):  # as aubio's own demo_bpm_extract does
            sr, _ = read_wav(path)
            win, hop = 1024, 512
            source, tempo, beats = aubio.source(path, sr, hop), aubio.tempo("default", win, hop, sr), []
            while True:
                samples, read = source()
                if tempo(samples):
                    beats.append(tempo.get_last_s())
                if read < hop:
                    break
            return from_beats(beats)

        return run
    if library == "pyaudioanalysis":
        # The library predates NumPy 2: the names it still uses, put back as they were.
        for old, new in (("Inf", "inf"), ("NaN", "nan"), ("float_", "float64")):
            if not hasattr(np, old):
                setattr(np, old, getattr(np, new))
        from pyAudioAnalysis import MidTermFeatures, ShortTermFeatures

        def run(path):
            sr, x = read_wav(path)
            features, _ = ShortTermFeatures.feature_extraction(x, sr, int(0.050 * sr), int(0.050 * sr))
            tempo, _ = MidTermFeatures.beat_extraction(features, 0.050)
            return float(tempo), None

        return run
    if library == "madmom":
        from madmom.features.beats import DBNBeatTrackingProcessor, RNNBeatProcessor
        from madmom.features.tempo import TempoEstimationProcessor

        rnn, dbn, tempo = RNNBeatProcessor(), DBNBeatTrackingProcessor(fps=100), TempoEstimationProcessor(fps=100)

        def run(path):
            activation = rnn(path)
            tempi = tempo(activation)
            return (float(tempi[0][0]) if len(tempi) else 0.0), [round(float(b), 4) for b in dbn(activation)]

        return run
    if library == "beat_this":
        import torch

        torch.set_num_threads(THREADS)
        from beat_this.inference import File2Beats

        file2beats = File2Beats(checkpoint_path="final0", device="cpu", dbn=False)

        def run(path):
            beats, _ = file2beats(path)
            return from_beats(beats)

        return run
    if library == "beatnet":
        import torch

        torch.set_num_threads(THREADS)
        from BeatNet.BeatNet import BeatNet

        estimator = BeatNet(1, mode="offline", inference_model="DBN", plot=[], thread=False)

        def run(path):
            out = estimator.process(path)
            return from_beats(out[:, 0] if len(out) else [])

        return run
    if library == "deeprhythm":
        import torch

        torch.set_num_threads(THREADS)
        from deeprhythm import DeepRhythmPredictor

        model = DeepRhythmPredictor(device="cpu")

        def run(path):
            return float(model.predict(path)), None

        return run
    if library == "essentia":
        import essentia.standard as es

        def run(path):
            audio = es.MonoLoader(filename=path, sampleRate=44100)()
            tempo, beats, *_ = es.RhythmExtractor2013(method="multifeature")(audio)
            return float(tempo), [round(float(b), 4) for b in beats]

        return run
    if library == "essentia_percival":
        import essentia.standard as es

        def run(path):
            return float(es.PercivalBpmEstimator()(es.MonoLoader(filename=path, sampleRate=44100)())), None

        return run
    raise SystemExit(f"no such library: {library}")


if __name__ == "__main__":
    library, which_sets = sys.argv[1], sys.argv[2:] or list(sets.SETS)
    run = make(library)
    os.makedirs(sets.RESULTS, exist_ok=True)
    for which in which_sets:
        name = f"{library}.{which}.jsonl" if WORKERS == 1 else f"{library}.{which}.{WORKER}of{WORKERS}.jsonl"
        done = set()
        for part in glob.glob(os.path.join(sets.RESULTS, f"{library}.{which}*.jsonl")):
            done |= {json.loads(line)["file"] for line in open(part, encoding="utf-8") if line.strip()}
        every = sets.part(which, PART) if PART else sets.files(which)
        todo = [p for i, p in enumerate(every) if i % WORKERS == WORKER and os.path.basename(p) not in done]
        with open(os.path.join(sets.RESULTS, name), "a", encoding="utf-8") as out:
            for path in todo:
                row = {"file": os.path.basename(path)}
                try:
                    with wave.open(path, "rb") as w:
                        seconds = w.getnframes() / w.getframerate()
                    began = time.perf_counter()
                    tempo, beats = run(path)
                    row.update(bpm=tempo, beats=beats, secs=round(time.perf_counter() - began, 4), dur=round(seconds, 2))
                except Exception as error:  # a file the library cannot read is a file it did not get
                    row.update(bpm=0.0, beats=None, secs=0.0, dur=0.0, error=str(error)[:200])
                out.write(json.dumps(row) + "\n")
                out.flush()
        print(f"{library} {which}: {len(done) + len(todo)} files", flush=True)
