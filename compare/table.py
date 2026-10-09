"""The comparison as Markdown: every engine on every set, by the same judge.

    python table.py

Reads results/<library>.<set>*.jsonl (from rival.py, btrack_run and Run.java) and
results/engine.<set>.jsonl (from this crate's `eval` example). A library that ran only part
of a set is scored on that part and marked, and this engine is scored on the same files.
"""
import glob
import json
import os

import numpy as np

import sets

NAMES = {
    "engine": "this engine",
    "essentia": "Essentia (multifeature)",
    "essentia_percival": "Essentia (Percival)",
    "btrack": "BTrack",
    "tarsosdsp": "TarsosDSP",
    "aubio": "aubio",
    "librosa": "librosa",
    "pyaudioanalysis": "pyAudioAnalysis",
    "deeprhythm": "DeepRhythm (neural)",
    "beatnet": "BeatNet (neural)",
    "madmom": "madmom (neural)",
    "beat_this": "beat_this (neural)",
}
# Sets a library's network was trained on, by its authors' own account.
TRAINED = {
    ("madmom", "ballroom"), ("madmom", "hainsworth"), ("madmom", "smc"),
    ("beat_this", "ballroom"), ("beat_this", "hainsworth"), ("beat_this", "smc"),
}
TRUTH = {which: sets.truth(which) for which in sets.SETS}


def rows_of(library, which):
    """file -> (tempo, beats or None), for the files that were annotated and did not fail."""
    rows = {}
    for path in glob.glob(os.path.join(sets.RESULTS, f"{library}.{which}*.jsonl")):
        for line in open(path, encoding="utf-8"):
            if line.startswith("BEAT "):  # this engine's `eval` example
                r = json.loads(line[5:])
                rows[r["file"]] = (next(w for w in r["windows"] if w[0] == 0)[1], r.get("beats"))
            elif line.strip():
                r = json.loads(line)
                if "error" not in r:
                    rows[r["file"]] = (r["bpm"], r.get("beats"))
    return {f: v for f, v in rows.items() if sets.key(which, f) in TRUTH[which]}


def score(rows, which, only=None):
    """(files, Accuracy1, Accuracy2, mean F-measure of the beats or None)."""
    files = [f for f in rows if only is None or f in only]
    if not files:
        return None
    true = [TRUTH[which][sets.key(which, f)] for f in files]
    a1 = np.mean([sets.accuracy1(rows[f][0], t[0]) for f, t in zip(files, true)])
    a2 = np.mean([sets.accuracy2(rows[f][0], t[0]) for f, t in zip(files, true)])
    f_of = [sets.fmeasure(rows[f][1], t[1]) for f, t in zip(files, true) if rows[f][1] is not None and t[1] is not None]
    return len(files), a1, a2, (float(np.mean(f_of)) if f_of else None)


ROWS = {(library, which): rows_of(library, which) for library in NAMES for which in sets.SETS}
cells, notes = {}, []
for library, shown in NAMES.items():
    for which in sets.SETS:
        rows, ours = ROWS[(library, which)], ROWS[("engine", which)]
        if not rows:
            continue
        if len(rows) >= len(ours) - 3:  # the whole set, but for a file or two the library could not read
            cells[(library, which)] = score(rows, which) + (False,)
            continue
        # Part of the set: the evenly spread part it was meant to run on if that is all there, else whatever is there.
        spread = next((s for s in ({os.path.basename(p) for p in sets.part(which, n)} for n in (166, 40))
                       if all(f in rows or f not in ours for f in s)), set(rows))
        cells[(library, which)] = score(rows, which, spread) + (True,)
        n, a1, a2, f = score(ours, which, spread)
        notes.append(f"{shown} on {which}: {cells[(library, which)][0]} files; this engine on the same files: "
                     f"{a1:.1%} / {a2:.1%}" + (f", beats F {f:.3f}" if f is not None and cells[(library, which)][3] is not None else ""))


def marks(library, which):
    return ("†" if cells[(library, which)][4] else "") + ("‡" if (library, which) in TRAINED else "")


def table(columns, cell, wanted):
    print("| | " + " | ".join(columns) + " | mean |")
    print("|---|" + "---|" * (len(columns) + 1))
    for library, shown in NAMES.items():
        got = [cells.get((library, which)) for which in columns]
        if not any(g and wanted(g) for g in got):
            continue
        line = [f"{cell(g)}{marks(library, which)}" if g and wanted(g) else "–" for g, which in zip(got, columns)]
        whole = all(g and wanted(g) for g in got)
        print(f"| {shown} | " + " | ".join(line) + " | " + (mean(got) + ("†" if any(g[4] for g in got) else "") if whole else "–") + " |")


print("Tempo: Accuracy1 / Accuracy2, percent\n")
mean = lambda got: f"{np.mean([g[1] for g in got]) * 100:.1f} / {np.mean([g[2] for g in got]) * 100:.1f}"
table(list(sets.SETS), lambda g: f"{g[1] * 100:.1f} / {g[2] * 100:.1f}", lambda g: True)
print("\nBeats: F-measure within 70 ms\n")
mean = lambda got: f"{np.mean([g[3] for g in got]):.3f}"
table([s for s in sets.SETS if s != "giantsteps"], lambda g: f"{g[3]:.3f}", lambda g: g[3] is not None)
print("\n† part of the set:")
for note in notes:
    print("  " + note)
print("‡ the library's network was trained on this set")
