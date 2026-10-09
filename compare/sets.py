"""The five benchmark sets: where their sound is, what was annotated, and the judge.

Everything is looked for under one folder, BEAT_SETS (default: ./sets), laid out as
the README of this folder says.
"""
import os

import numpy as np

ROOT = os.environ.get("BEAT_SETS", "sets")
HERE = os.path.dirname(os.path.abspath(__file__))
RESULTS = os.environ.get("BEAT_RESULTS", os.path.join(HERE, "results"))
SETS = ("ballroom", "gtzan", "giantsteps", "hainsworth", "smc")
AUDIO = {
    "ballroom": "ballroom/BallroomData",
    "gtzan": "gtzan/genres",
    "giantsteps": "giantsteps/wav",
    "hainsworth": "hainsworth/wavs",
    "smc": "smc/audio",
}


def files(which):
    """Every WAV of a set, in a fixed order."""
    out = []
    for folder, _, names in os.walk(os.path.join(ROOT, AUDIO[which])):
        out += [os.path.join(folder, n) for n in names if n.lower().endswith(".wav") and not n.startswith("._")]
    return sorted(out)


def part(which, count):
    """`count` files of a set, evenly spread (all of them if it has no more): what an engine
    too slow for the whole set was run on."""
    every = files(which)
    return every if len(every) <= count else every[:: len(every) // count][:count]


def key(which, file):
    """What a file is called in the annotations."""
    return file.split(".")[0] if which == "giantsteps" else file[:-4]


def _beats(path):
    return np.array([float(line.split()[0]) for line in open(path) if line.strip()])


def truth(which):
    """name -> (tempo in beats a minute, annotated beat times or None).

    Where beats are annotated the tempo is 60 over the median gap between them.
    """
    found = {}

    def beats_in(folder, name_of):
        folder = os.path.join(ROOT, folder)
        for f in os.listdir(folder):
            if f.endswith((".beats", ".txt")):
                b = _beats(os.path.join(folder, f))
                if len(b) >= 4:
                    found[name_of(f)] = (60 / np.median(np.diff(b)), b)

    if which == "ballroom":
        beats_in("ballroom/beats", lambda f: f[:-6])
    elif which == "gtzan":  # gtzan_<genre>_<number>.beats, for <genre>.<number>.wav
        beats_in("gtzan/beats", lambda f: ".".join(f[:-6].split("_")[1:]))
    elif which == "hainsworth":  # hainsworth_<number>.beats, for <number>.wav
        beats_in("hainsworth/beats", lambda f: f[len("hainsworth_"):-6])
    elif which == "smc":  # SMC_<number>_….txt, for SMC_<number>.wav
        beats_in("smc/beats", lambda f: f[:7])
    elif which == "giantsteps":  # the corrected tempo where there is one
        for folder in ("giantsteps/tempo", "giantsteps/tempo_v2"):
            folder = os.path.join(ROOT, folder)
            for f in os.listdir(folder) if os.path.isdir(folder) else []:
                if f.endswith(".bpm"):
                    try:
                        found[f.split(".")[0]] = (float(open(os.path.join(folder, f)).read().split()[0]), None)
                    except (ValueError, IndexError):
                        pass
    return {name: t for name, t in found.items() if t[0] > 0}


def accuracy1(tempo, true):
    """Within 4% of the annotated tempo."""
    return bool(tempo and abs(tempo - true) / true <= 0.04)


def accuracy2(tempo, true):
    """The same, also accepting twice, three times, half or a third of it."""
    return bool(tempo and any(abs(tempo * m - true) / true <= 0.04 for m in (1, 2, 3, 1 / 2, 1 / 3)))


def fmeasure(beats, true, within=0.07):
    """F-measure of beats against annotated ones: each annotated beat is hit by at most one
    beat, no further than 70 ms from it."""
    beats = np.asarray(beats, dtype=float)
    if len(beats) == 0 or len(true) == 0:
        return 0.0
    used = np.zeros(len(beats), bool)
    hits = 0
    for t in true:
        far = np.abs(beats - t)
        far[used] = 9
        nearest = int(np.argmin(far))
        if far[nearest] <= within:
            used[nearest] = True
            hits += 1
    precision, recall = hits / len(beats), hits / len(true)
    return 2 * precision * recall / (precision + recall) if hits else 0.0
