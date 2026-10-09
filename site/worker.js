// The engine, off the page's thread. Sound comes in as mono samples; what comes back is
// the reading, every beat, and how long it took. The onsets are kept, so that the same
// song can be counted again at half or double the tempo without being heard again.

let taktus;
let onsets = null;

addEventListener("message", async ({ data }) => {
  try {
    taktus ??= await import("./taktus/index.js");
    if (data.type === "read") {
      const began = performance.now();
      const ear = new taktus.Ear(data.rate);
      const parts = [];
      let count = 0;
      // A second at a time: the engine's own memory then stays small, however long the song.
      for (let at = 0; at < data.samples.length; at += data.rate) {
        const part = ear.hear(data.samples.subarray(at, at + data.rate));
        parts.push(part);
        count += part.length;
      }
      ear.free();
      onsets = new Float32Array(count);
      let at = 0;
      for (const part of parts) {
        onsets.set(part, at);
        at += part.length;
      }
      const beat = taktus.tempoOf(onsets);
      const beats = beat ? taktus.beatsOf(onsets, beat.period) : new Float64Array(0);
      postMessage({ id: data.id, beat, beats, ms: performance.now() - began }, [beats.buffer]);
    } else if (data.type === "recount") {
      const beats = onsets ? taktus.beatsOf(onsets, data.period) : new Float64Array(0);
      postMessage({ id: data.id, beats }, [beats.buffer]);
    }
  } catch (error) {
    postMessage({ id: data.id, error: String(error?.message ?? error) });
  }
});
