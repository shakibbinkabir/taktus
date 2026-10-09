// The page's behaviour: the install command, the code tabs, things arriving as they are
// scrolled to, and the demo. The engine itself runs in worker.js, off this thread.

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const calm = matchMedia("(prefers-reduced-motion: reduce)");

// ── Choices: a row of buttons of which one is on ────────────────────────────

/** Makes a radiogroup or tablist work with pointer and arrow keys; `chosen(button)` on change. */
function choices(group, chosen) {
  const buttons = $$("button", group);
  const flag = group.getAttribute("role") === "tablist" ? "aria-selected" : "aria-checked";
  const choose = (button, focus) => {
    for (const b of buttons) {
      b.setAttribute(flag, String(b === button));
      b.tabIndex = b === button ? 0 : -1;
    }
    if (focus) button.focus();
    chosen(button);
  };
  group.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (button && button.getAttribute(flag) !== "true") choose(button);
  });
  group.addEventListener("keydown", (event) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const at = buttons.findIndex((b) => b.getAttribute(flag) === "true");
    choose(buttons[(at + step + buttons.length) % buttons.length], true);
  });
  return (button) => choose(button);
}

// ── The install command ──────────────────────────────────────────────────────

{
  const command = $("[data-cmd-text]");
  const copy = $("[data-copy]");
  const copied = $("[data-copied]");
  choices($("[data-install] .seg"), (button) => {
    command.textContent = button.dataset.cmd;
    language(button.textContent.trim());
  });
  let back;
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(command.textContent);
    } catch {
      return; // no clipboard here: the command is on the page to be selected
    }
    copy.classList.add("done");
    copied.textContent = "Copied";
    clearTimeout(back);
    back = setTimeout(() => {
      copy.classList.remove("done");
      copied.textContent = "";
    }, 1600);
  });
}

// ── The code tabs ────────────────────────────────────────────────────────────

const tabs = choices($("[data-code] [role=tablist]"), (tab) => {
  for (const panel of $$("[data-code] [role=tabpanel]")) panel.hidden = panel.id !== tab.getAttribute("aria-controls");
});
/** The language chosen above is the one shown below. */
function language(name) {
  const tab = $$("[data-code] [role=tab]").find((t) => t.textContent.trim() === name);
  if (tab && tab.getAttribute("aria-selected") !== "true") tabs(tab);
}

// ── Arriving on scroll ───────────────────────────────────────────────────────

{
  const seen = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("in");
        seen.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
  );
  for (const el of $$(".reveal")) seen.observe(el);
}

// ── The demo ─────────────────────────────────────────────────────────────────

const stage = $("[data-stage]");
const el = {
  file: $("[data-file]"),
  bpm: $("[data-bpm]"),
  pulse: $("[data-pulse]"),
  source: $("[data-source]"),
  beats: $("[data-beats]"),
  ms: $("[data-ms]"),
  conf: $("[data-conf]"),
  play: $("[data-play]"),
  track: $("[data-track]"),
  time: $("[data-time]"),
  error: $("[data-error]"),
  hint: $("[data-hint]"),
  said: $("[data-said]"),
  levels: $(".view-result [role=radiogroup]"),
};

/** The most of a song that is read: ten minutes. */
const MOST = 600;

let context; // made at the first file or beat: a browser wants a gesture first
let song = null; // the decoded sound
let reading = null; // { bpm, period, sure, catch } as the engine read it
let beats = new Float64Array(0); // every beat, in seconds from the start
let run = 0; // which reading is the current one: an older one that finishes late is dropped

const show = (state) => (stage.dataset.state = state);
const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

// The engine, in its worker. Each question gets its own answer back.
let worker;
let asked = 0;
const waiting = new Map();
function ask(message, transfer = []) {
  if (!worker) {
    worker = new Worker("worker.js", { type: "module" });
    worker.addEventListener("message", ({ data }) => {
      const answer = waiting.get(data.id);
      waiting.delete(data.id);
      if (answer) data.error ? answer.reject(new Error(data.error)) : answer.resolve(data);
    });
    worker.addEventListener("error", () => {
      for (const answer of waiting.values()) answer.reject(new Error("worker"));
      waiting.clear();
      worker = null;
    });
  }
  return new Promise((resolve, reject) => {
    const id = ++asked;
    waiting.set(id, { resolve, reject });
    worker.postMessage({ id, ...message }, transfer);
  });
}

function fail(message, hint) {
  stop();
  el.error.textContent = message;
  el.hint.textContent = hint;
  el.said.textContent = `${message} ${hint}`;
  show("error");
}

/** Reads a decoded song and shows what was found. `from` says where the sound came from. */
async function read(audio, from) {
  const mine = ++run;
  stop();
  song = audio;
  show("busy");
  // The waiting state is painted before the samples are mixed down.
  await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve)));

  const length = Math.min(audio.length, audio.sampleRate * MOST);
  const mono = new Float32Array(length);
  for (let channel = 0; channel < audio.numberOfChannels; channel++) {
    const data = audio.getChannelData(channel);
    for (let i = 0; i < length; i++) mono[i] += data[i];
  }
  if (audio.numberOfChannels > 1) for (let i = 0; i < length; i++) mono[i] /= audio.numberOfChannels;

  let result;
  try {
    result = await ask({ type: "read", samples: mono, rate: audio.sampleRate }, [mono.buffer]);
  } catch {
    if (mine === run) fail("The engine could not be loaded.", "Reload the page and try again.");
    return;
  }
  if (mine !== run) return;
  if (!result.beat || result.beats.length < 4) return fail("No beat was found in this one.", "Try a song with a steady rhythm.");

  reading = result.beat;
  beats = result.beats;
  level(1, true);
  el.source.textContent = from;
  el.ms.textContent = `${Math.max(1, Math.round(result.ms))} ms`;
  const sure = reading.sure >= 0.05 && reading.catch >= 1.0;
  el.conf.textContent = sure ? "High" : "Low";
  el.conf.title = `sure ${reading.sure.toFixed(2)}, catch ${reading.catch.toFixed(2)}`;
  el.track.setAttribute("aria-valuemax", String(Math.round(song.duration)));
  show("result");
  size();
  el.said.textContent = `${el.bpm.textContent} beats a minute, ${beats.length} beats found.`;
}

/** Shows the tempo and beat count for beats counted `times` as far apart as read. */
function level(times, fresh) {
  el.bpm.textContent = (60 / (reading.period * times)).toFixed(1);
  el.beats.textContent = String(beats.length);
  if (fresh) pick($("[data-level='1']", el.levels));
  next = upcoming(heard());
  draw();
}

const pick = (() => {
  let quiet = false;
  const set = choices(el.levels, async (button) => {
    if (quiet || !reading) return;
    const times = Number(button.dataset.level);
    const mine = run;
    try {
      const again = await ask({ type: "recount", period: reading.period * times });
      if (mine !== run) return;
      beats = again.beats;
      level(times, false);
    } catch {
      /* the count shown stays */
    }
  });
  return (button) => {
    quiet = true;
    set(button);
    quiet = false;
  };
})();

async function open(file) {
  if (!file) return;
  const mine = ++run;
  stop();
  show("busy");
  context ??= new (window.AudioContext || window.webkitAudioContext)();
  let audio;
  try {
    audio = await context.decodeAudioData(await file.arrayBuffer());
  } catch {
    if (mine === run) fail("That file could not be read as audio.", "Try an MP3, a WAV or an M4A.");
    return;
  }
  if (mine === run) read(audio, file.name);
}

/** A drum pattern at a tempo drawn at random, made here: something to read with no file at hand. */
async function generated() {
  const mine = ++run;
  stop();
  show("busy");
  context ??= new (window.AudioContext || window.webkitAudioContext)();
  const tempo = [100, 104, 110, 118, 124, 128, 136, 140][Math.floor(Math.random() * 8)];
  const [rate, seconds, step] = [44_100, 24, 30 / tempo];
  const offline = new OfflineAudioContext(1, rate * seconds, rate);
  const noise = offline.createBuffer(1, rate / 2, rate);
  const grains = noise.getChannelData(0);
  for (let i = 0; i < grains.length; i++) grains[i] = Math.random() * 2 - 1;

  const hit = (node, at, loud, lasts) => {
    const gain = offline.createGain();
    gain.gain.setValueAtTime(loud, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + lasts);
    node.connect(gain).connect(offline.destination);
    node.start(at);
    node.stop(at + lasts + 0.02);
  };
  const hiss = (at, above, loud, lasts) => {
    const source = offline.createBufferSource();
    source.buffer = noise;
    const filter = offline.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = above;
    source.connect(filter);
    const gain = offline.createGain();
    gain.gain.setValueAtTime(loud, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + lasts);
    filter.connect(gain).connect(offline.destination);
    source.start(at);
    source.stop(at + lasts + 0.02);
  };
  // Half a beat at a time: a bass drum on the beat, a snare on two and four, a hat throughout.
  for (let i = 0, at = 0.1; at < seconds - 0.4; i++, at += step) {
    if (i % 2 === 0) {
      const drum = offline.createOscillator();
      drum.frequency.setValueAtTime(130, at);
      drum.frequency.exponentialRampToValueAtTime(46, at + 0.11);
      hit(drum, at, 0.9, 0.22);
    }
    if (i % 4 === 2) hiss(at, 1800, 0.45, 0.14);
    hiss(at, 7000, i % 2 ? 0.2 : 0.1, 0.04);
  }
  const audio = await offline.startRendering();
  if (mine === run) read(audio, `A generated beat at ${tempo} beats a minute`);
}

// ── Playing it back, with the beats shown as they pass ───────────────────────

let source = null; // what is sounding
let startedAt = 0; // on the context's clock
let offset = 0; // seconds into the song when it started or stopped
let frame = 0;
let next = 0; // the next beat to light

const playing = () => source !== null;
const position = () => (playing() ? Math.min(song.duration, offset + context.currentTime - startedAt) : offset);
/** Where the listener is: the sound comes out a little after it is sent. */
const heard = () => Math.max(0, position() - (playing() ? context.outputLatency || context.baseLatency || 0 : 0));
const upcoming = (time) => {
  let i = 0;
  while (i < beats.length && beats[i] <= time) i++;
  return i;
};

function play() {
  if (!song) return;
  context.resume();
  if (offset >= song.duration - 0.05) offset = 0;
  source = context.createBufferSource();
  source.buffer = song;
  source.connect(context.destination);
  source.start(0, offset);
  startedAt = context.currentTime;
  const mine = source;
  source.onended = () => mine === source && position() >= song.duration - 0.05 && stop(true);
  next = upcoming(heard());
  el.play.classList.add("on");
  el.play.setAttribute("aria-label", "Pause");
  frame = requestAnimationFrame(tick);
}

function stop(atEnd = false) {
  if (playing()) {
    offset = atEnd ? 0 : position();
    source.onended = null;
    source.stop();
    source.disconnect();
    source = null;
  }
  cancelAnimationFrame(frame);
  el.play.classList.remove("on");
  el.play.setAttribute("aria-label", "Play");
  if (song) draw();
}

function seek(time, resume = playing()) {
  stop();
  offset = Math.min(Math.max(time, 0), song.duration);
  next = upcoming(offset);
  resume ? play() : draw();
}

function tick() {
  const time = heard();
  let lit = false;
  while (next < beats.length && beats[next] <= time) {
    next++;
    lit = true;
  }
  if (lit) {
    const frames = calm.matches
      ? [{ opacity: 1 }, { opacity: 0.28 }]
      : [{ transform: "scale(2.1)", opacity: 1 }, { transform: "scale(1)", opacity: 0.28 }];
    el.pulse.animate(frames, { duration: 380, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
  }
  draw();
  frame = requestAnimationFrame(tick);
}

// The track: a tick for every beat, and where the song is.
const pen = el.track.getContext("2d");
let ink = {};
function colours() {
  const style = getComputedStyle(document.documentElement);
  ink = { on: style.getPropertyValue("--ink").trim(), off: style.getPropertyValue("--ink-3").trim(), head: style.getPropertyValue("--accent").trim() };
}
function size() {
  const scale = window.devicePixelRatio || 1;
  el.track.width = Math.max(1, Math.round(el.track.clientWidth * scale));
  el.track.height = Math.max(1, Math.round(el.track.clientHeight * scale));
  draw();
}
let saidAt = -1;
function draw() {
  if (!song) return;
  const { width, height } = el.track;
  const scale = window.devicePixelRatio || 1;
  const time = heard();
  const at = (seconds) => Math.round((seconds / song.duration) * (width - 2 * scale)) + scale;
  pen.clearRect(0, 0, width, height);
  // Beats closer than three pixels would run together: every second, every fourth is drawn instead.
  let every = 1;
  while (beats.length / every > width / (3 * scale)) every *= 2;
  const thick = Math.max(1, Math.round(1.25 * scale));
  for (let i = 0; i < beats.length; i += every) {
    pen.fillStyle = beats[i] <= time ? ink.on : ink.off;
    pen.fillRect(at(beats[i]), Math.round(height * 0.3), thick, Math.round(height * 0.4));
  }
  pen.fillStyle = ink.head;
  pen.fillRect(at(time) - scale, Math.round(height * 0.12), 2 * scale, Math.round(height * 0.76));
  const second = Math.floor(time);
  if (second !== saidAt) {
    saidAt = second;
    el.time.textContent = clock(time);
    el.track.setAttribute("aria-valuenow", String(second));
    el.track.setAttribute("aria-valuetext", `${clock(time)} of ${clock(song.duration)}`);
  }
}

colours();
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  colours();
  draw();
});
new ResizeObserver(size).observe(el.track);

// ── What the visitor does ────────────────────────────────────────────────────

el.file.addEventListener("change", () => {
  open(el.file.files[0]);
  el.file.value = "";
});
$("[data-generate]").addEventListener("click", generated);
for (const again of $$("[data-reset]")) {
  again.addEventListener("click", () => {
    run++;
    stop();
    song = null;
    show("idle");
  });
}
el.play.addEventListener("click", () => (playing() ? stop() : play()));

{
  let held = false;
  let resume = false;
  const where = (event) => {
    const box = el.track.getBoundingClientRect();
    return ((event.clientX - box.left) / box.width) * song.duration;
  };
  el.track.addEventListener("pointerdown", (event) => {
    if (!song) return;
    held = true;
    resume = playing();
    el.track.setPointerCapture(event.pointerId);
    seek(where(event), false);
  });
  el.track.addEventListener("pointermove", (event) => held && seek(where(event), false));
  const release = () => {
    if (held && resume) play();
    held = false;
  };
  el.track.addEventListener("pointerup", release);
  el.track.addEventListener("pointercancel", release);
  el.track.addEventListener("keydown", (event) => {
    if (!song) return;
    const to = { ArrowRight: position() + 5, ArrowLeft: position() - 5, Home: 0, End: song.duration }[event.key];
    if (to === undefined) return;
    event.preventDefault();
    seek(to);
  });
}

// A file dropped anywhere on the page is not opened by the browser in its place.
addEventListener("dragover", (event) => event.preventDefault());
addEventListener("drop", (event) => event.preventDefault());
for (const type of ["dragenter", "dragover"]) {
  stage.addEventListener(type, (event) => {
    event.preventDefault();
    stage.classList.add("over");
  });
}
stage.addEventListener("dragleave", (event) => !stage.contains(event.relatedTarget) && stage.classList.remove("over"));
stage.addEventListener("drop", (event) => {
  event.preventDefault();
  stage.classList.remove("over");
  open(event.dataTransfer.files[0]);
});
