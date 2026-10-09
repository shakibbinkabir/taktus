"""What an engine costs on the same twenty 30-second excerpts (every fiftieth file of GTZAN),
one after the other on one thread: time per second of sound once it is warm, the time to
get ready, and the most memory the process held. Run it on a machine doing nothing else.

    python cost.py <library>                      a library rival.py knows
    python cost.py run <label> <program> [args]   a program given the files as its last arguments
    python cost.py feed <label> <program> [args]  a program given the files' paths on its input, a line each
    python cost.py folder <label> <program> [args with {}]   a program given, where {} stands, a folder holding them
"""
import os
import shutil
import subprocess
import sys
import time

for name in ("OMP_NUM_THREADS", "MKL_NUM_THREADS", "OPENBLAS_NUM_THREADS", "NUMBA_NUM_THREADS", "THREADS"):
    os.environ[name] = "1"

import sets  # noqa: E402  (after the threads are set)

FILES = sets.files("gtzan")[::50][:20]
SOUND = 30.0 * len(FILES)


def peak_mb(child=None):
    """The most memory this process (or a child that has ended) held, in megabytes."""
    if os.name == "nt":
        import ctypes
        import ctypes.wintypes as w

        class Counters(ctypes.Structure):
            _fields_ = [("cb", w.DWORD), ("faults", w.DWORD)] + [(n, ctypes.c_size_t) for n in ("peak", "now", "a", "b", "c", "d", "e", "f")]

        kernel, psapi = ctypes.windll.kernel32, ctypes.windll.psapi
        kernel.GetCurrentProcess.restype = w.HANDLE
        psapi.GetProcessMemoryInfo.argtypes = [w.HANDLE, ctypes.POINTER(Counters), w.DWORD]
        counters = Counters()
        counters.cb = ctypes.sizeof(Counters)
        psapi.GetProcessMemoryInfo(int(child._handle) if child else kernel.GetCurrentProcess(), ctypes.byref(counters), counters.cb)
        return counters.peak / 2**20
    import resource

    held = resource.getrusage(resource.RUSAGE_CHILDREN if child else resource.RUSAGE_SELF).ru_maxrss
    return held / (2**20 if sys.platform == "darwin" else 2**10)


if sys.argv[1] in ("run", "feed", "folder"):
    how, label, command = sys.argv[1], sys.argv[2], sys.argv[3:]
    if how == "run":
        command += FILES
    elif how == "folder":
        folder = os.path.join(sets.RESULTS, "twenty")
        os.makedirs(folder, exist_ok=True)
        for f in FILES:
            shutil.copy(f, folder)
        command = [a.replace("{}", folder) for a in command]
    began = time.perf_counter()
    child = subprocess.Popen(command, stdin=subprocess.PIPE if how == "feed" else None, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if how == "feed":
        child.communicate(chr(10).join(FILES).encode())
    child.wait()
    spent = time.perf_counter() - began
    print(f"{label:<18} {1000 * spent / SOUND:9.2f} ms per second of sound (starting up included)   most memory {peak_mb(child):7.1f} MB", flush=True)
else:
    began = time.perf_counter()
    import rival

    run = rival.make(sys.argv[1])
    run(FILES[0])  # imports, weights, and whatever the first call compiles
    ready = time.perf_counter() - began
    began = time.perf_counter()
    for f in FILES:
        run(f)
    spent = time.perf_counter() - began
    print(f"{sys.argv[1]:<18} {1000 * spent / SOUND:9.2f} ms per second of sound   ready after {ready:5.1f} s   most memory {peak_mb():7.1f} MB", flush=True)
