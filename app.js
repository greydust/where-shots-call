import { PRESETS } from './data/presets.js';

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

/** How long a fired cue stays highlighted, in milliseconds. */
const HIGHLIGHT_MS = 5000;

/** Timestamps within this many seconds count as crossed (float tolerance). */
const EPS = 0.0005;

/** Edge length of the progress bar when a preset has no explicit duration. */
const TAIL_SECONDS = 10;

/** Hold this long before nudge buttons start auto-repeating. */
const HOLD_DELAY_MS = 420;
const HOLD_REPEAT_MS = 90;

const DEFAULT_SOUND = 'chime';

/* ------------------------------------------------------------------ */
/* DOM                                                                 */
/* ------------------------------------------------------------------ */

const el = {
  app: document.getElementById('app'),
  presetTabs: document.getElementById('presetTabs'),
  clock: document.getElementById('clock'),
  clockState: document.getElementById('clockState'),
  nextCue: document.getElementById('nextCue'),
  nextCueText: document.getElementById('nextCueText'),
  nextCueIn: document.getElementById('nextCueIn'),
  progress: document.getElementById('progress'),
  progressBar: document.getElementById('progressBar'),
  toggleBtn: document.getElementById('toggleBtn'),
  resetBtn: document.getElementById('resetBtn'),
  nudgeBtns: [...document.querySelectorAll('[data-delta]')],
  cueList: document.getElementById('cueList'),
  cueNote: document.getElementById('cueNote'),
  soundToggle: document.getElementById('soundToggle'),
  soundToggleLabel: document.getElementById('soundToggleLabel'),
};

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

/** @type {number} Index into PRESETS. */
let presetIndex = 0;

/** Elapsed seconds shown on the clock. Only ever nudged up and down by us. */
let elapsed = 0;

/** Whether the clock is advancing. */
let running = false;

/** performance.now() of the previous tick, or null right after a reset/start. */
let lastTick = null;

/** Ids of cues that have already fired, so they fire once per pass. */
const fired = new Set();

/** Key -> wall-clock time it fired, used to expire the 5s highlight. */
const firedAt = new Map();

let muted = false;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Stable id for a cue so `fired` survives re-renders and preset switches. */
function cueId(cue, index) {
  return `${cue.t}:${index}`;
}

/** Current preset, normalised so it always has an array of cues. */
function preset() {
  const p = PRESETS[presetIndex] ?? { id: 'none', name: 'None', cues: [] };
  return { ...p, cues: (p.cues ?? []).slice().sort((a, b) => a.t - b.t) };
}

/** Cues paired with their stable ids, in timestamp order. */
function cueList() {
  return preset().cues.map((cue, index) => ({ ...cue, id: cueId(cue, index) }));
}

/** Length of the progress bar, in seconds. */
function span() {
  const p = preset();
  if (typeof p.duration === 'number' && p.duration > 0) return p.duration;
  const cues = p.cues ?? [];
  return cues.length ? cues[cues.length - 1].t + TAIL_SECONDS : TAIL_SECONDS;
}

/** 12.4 -> "0:12.4" */
function formatTime(seconds) {
  const clamped = Math.max(0, seconds);
  const m = Math.floor(clamped / 60);
  const s = Math.floor(clamped % 60);
  const d = Math.floor((clamped % 1) * 10);
  return `${m}:${String(s).padStart(2, '0')}.${d}`;
}

/* ------------------------------------------------------------------ */
/* Audio                                                               */
/* ------------------------------------------------------------------ */

const audio = {
  ctx: null,
  master: null,

  /** Lazily create the context. Must be called from a user gesture. */
  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },
};

/**
 * One enveloped oscillator voice.
 * @param {object} o
 */
function voice({
  type = 'sine',
  freq,
  glideTo = null,
  delay = 0,
  dur = 0.3,
  gain = 0.3,
}) {
  const ctx = audio.ctx;
  const t0 = ctx.currentTime + delay;

  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (glideTo !== null) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  osc.connect(amp).connect(audio.master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

/** Synth cues. Keys match the `sound` field in data/presets.js. */
const SOUNDS = {
  /** Bright two-partial bell. Good default for "the fight starts". */
  chime(ctx) {
    voice({ freq: 880, dur: 0.9, gain: 0.26 });
    voice({ freq: 880 * 2.76, dur: 0.45, gain: 0.07 });
  },

  /** Three urgent blips. Use when reacting is time-critical. */
  alert(ctx) {
    [0, 0.14, 0.28].forEach((delay, i) => {
      voice({ type: 'square', freq: 720 + i * 180, delay, dur: 0.11, gain: 0.2 });
    });
  },

  /** Low impact with a pitch drop. Use for deflects and slams. */
  thud(ctx) {
    voice({ freq: 130, glideTo: 52, dur: 0.5, gain: 0.4 });
    voice({ type: 'triangle', freq: 190, glideTo: 70, dur: 0.22, gain: 0.12 });
  },

  /** Short dry click. */
  tick(ctx) {
    voice({ type: 'square', freq: 1500, dur: 0.035, gain: 0.16 });
  },

  /** Rising arpeggio. Use for a phase change or a kill. */
  fanfare(ctx) {
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      voice({ freq, delay: i * 0.1, dur: 0.34, gain: 0.22 });
    });
  },
};

function playSound(name) {
  if (muted) return;
  const ctx = audio.unlock();
  if (!ctx) return;
  const fn = SOUNDS[name] ?? SOUNDS[DEFAULT_SOUND];
  fn(ctx);
}

/* ------------------------------------------------------------------ */
/* Cue firing                                                          */
/* ------------------------------------------------------------------ */

/**
 * Fire every un-fired cue in the half-open range (before, after].
 * This makes a forward nudge ring the cues it skipped over, and lets a cue
 * at 0:00 fire on the first tick after a reset.
 */
function checkCrossings(before, after) {
  for (const cue of cueList()) {
    if (fired.has(cue.id)) continue;
    if (cue.t > before - EPS && cue.t <= after + EPS) {
      fired.add(cue.id);
      fireCue(cue);
    }
  }
}

function fireCue(cue) {
  firedAt.set(cue.id, performance.now());
  playSound(cue.sound);
  if (navigator.vibrate) navigator.vibrate(45);

  // Restart the border flash animation.
  el.app.classList.remove('is-cue-flash');
  void el.app.offsetWidth;
  el.app.classList.add('is-cue-flash');
  window.setTimeout(() => el.app.classList.remove('is-cue-flash'), 600);

  render(performance.now());
}

/* ------------------------------------------------------------------ */
/* Timer controls                                                      */
/* ------------------------------------------------------------------ */

function start() {
  if (running) return;
  audio.unlock();
  running = true;
  lastTick = null; // discard the idle gap so the clock starts from exactly here
  render(performance.now());
}

function pause() {
  if (!running) return;
  running = false;
  lastTick = null;
  render(performance.now());
}

function toggle() {
  running ? pause() : start();
}

function reset() {
  running = false;
  elapsed = 0;
  lastTick = null;
  fired.clear();
  firedAt.clear();
  render(performance.now());
}

/** Move the clock by `delta` seconds without breaking cue bookkeeping. */
function nudge(delta) {
  if (!delta) return;
  const before = elapsed;
  elapsed = Math.max(0, before + delta);

  if (delta < 0) {
    // Rewinding: cues we pass back over are eligible to ring again.
    for (const id of fired) {
      const cue = cueList().find((c) => c.id === id);
      if (!cue || cue.t > elapsed) fired.delete(id);
    }
  } else {
    checkCrossings(before, elapsed);
  }

  render(performance.now());
}

/* ------------------------------------------------------------------ */
/* Render                                                              */
/* ------------------------------------------------------------------ */

function render(now) {
  const cues = cueList();
  const next = cues.find((cue) => cue.t > elapsed + EPS && !fired.has(cue.id));

  el.clock.textContent = formatTime(elapsed);
  el.clockState.textContent = running ? 'Running' : elapsed > 0 ? 'Paused' : 'Ready';
  el.app.dataset.running = String(running);
  el.toggleBtn.textContent = running ? 'Pause' : elapsed > 0 ? 'Resume' : 'Start';

  // Next cue card
  el.nextCue.dataset.empty = String(!next);
  el.nextCue.classList.toggle('is-next', Boolean(next));
  if (next) {
    el.nextCueText.textContent = next.text;
    const away = Math.max(0, next.t - elapsed);
    el.nextCueIn.textContent = away >= 10 ? `in ${Math.round(away)}s` : `in ${away.toFixed(1)}s`;
  } else if (cues.length && elapsed >= cues[cues.length - 1].t - EPS) {
    el.nextCueText.textContent = 'All cues done';
    el.nextCueIn.textContent = '';
  } else {
    el.nextCueText.textContent = '—';
    el.nextCueIn.textContent = '';
  }

  // Progress bar
  const pct = Math.min(100, (elapsed / span()) * 100);
  el.progressBar.style.width = `${pct}%`;
  el.progress.setAttribute('aria-valuenow', String(Math.round(pct)));

  // Cue rows
  for (const li of el.cueList.children) {
    const cue = cues[Number(li.dataset.index)];
    if (!cue) continue;
    const active = (firedAt.get(cue.id) ?? -Infinity) + HIGHLIGHT_MS > now;
    li.classList.toggle('is-active', active);
    li.classList.toggle('is-next', cue === next);
  }
}

/* ------------------------------------------------------------------ */
/* Preset wiring                                                       */
/* ------------------------------------------------------------------ */

function buildPresetTabs() {
  el.presetTabs.replaceChildren();
  PRESETS.forEach((preset, index) => {
    const count = preset.cues?.length ?? 0;
    const btn = document.createElement('button');
    btn.className = 'preset-tab';
    btn.type = 'button';
    btn.role = 'tab';
    btn.id = `tab-${preset.id}`;
    btn.setAttribute('aria-selected', String(index === presetIndex));
    btn.append(preset.name);
    if (count) {
      const sub = document.createElement('span');
      sub.className = 'preset-count';
      sub.textContent = `${count} cue${count === 1 ? '' : 's'}`;
      btn.append(sub);
    }
    btn.addEventListener('click', () => selectPreset(index));
    el.presetTabs.append(btn);
  });
}

function buildCueList() {
  const cues = cueList();
  el.cueList.replaceChildren();

  cues.forEach((cue, index) => {
    const li = document.createElement('li');
    li.className = 'cue';
    li.dataset.index = String(index);

    const time = document.createElement('span');
    time.className = 'cue-t';
    time.textContent = formatTime(cue.t);

    const text = document.createElement('span');
    text.className = 'cue-text';
    text.textContent = cue.text;

    const sound = document.createElement('span');
    sound.className = 'cue-sound';
    sound.textContent = cue.sound ?? DEFAULT_SOUND;

    li.append(time, text, sound);
    el.cueList.append(li);
  });

  const note = preset().note;
  el.cueNote.hidden = !(note && cues.length === 0);
  el.cueNote.textContent = note ?? '';
}

function selectPreset(index) {
  if (index === presetIndex || !PRESETS[index]) return;
  presetIndex = index;
  for (const btn of el.presetTabs.children) {
    btn.setAttribute('aria-selected', String(btn === el.presetTabs.children[index]));
  }
  buildCueList();
  reset();
}

/* ------------------------------------------------------------------ */
/* Input                                                               */
/* ------------------------------------------------------------------ */

/** Press to nudge once, hold to nudge continuously. */
function bindHold(button, fn) {
  let holdTimer = 0;
  let repeatTimer = 0;
  let fromPointer = false;

  const stop = () => {
    window.clearTimeout(holdTimer);
    window.clearInterval(repeatTimer);
    holdTimer = repeatTimer = 0;
  };

  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    fromPointer = true;
    fn();
    holdTimer = window.setTimeout(() => {
      repeatTimer = window.setInterval(fn, HOLD_REPEAT_MS);
    }, HOLD_DELAY_MS);
  });

  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
    button.addEventListener(type, stop);
  }

  // Keyboard activation still arrives as a click, so ignore the click that
  // follows a pointer press to avoid firing twice.
  button.addEventListener('click', () => {
    if (fromPointer) {
      fromPointer = false;
      return;
    }
    fn();
  });
}

function setMuted(next) {
  muted = next;
  el.soundToggle.setAttribute('aria-pressed', String(muted));
  el.soundToggleLabel.textContent = muted ? 'Muted' : 'Sound on';
}

function onKeydown(event) {
  const tag = event.target?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || event.metaKey || event.ctrlKey) return;

  const step = event.shiftKey ? 10 : event.altKey ? 0.5 : 1;
  const nudgeKey = { ArrowUp: step, ArrowDown: -step, w: step, s: -step }[event.key];

  if (nudgeKey !== undefined) {
    event.preventDefault();
    nudge(nudgeKey);
    return;
  }

  if (event.key === ' ' || event.key === 'Spacebar') {
    event.preventDefault();
    toggle();
    return;
  }

  const key = event.key.toLowerCase();
  if (key === 'r') {
    reset();
  } else if (key === 'm') {
    setMuted(!muted);
  } else if (/^[1-9]$/.test(key)) {
    selectPreset(Number(key) - 1);
  }
}

/* ------------------------------------------------------------------ */
/* Loop                                                                */
/* ------------------------------------------------------------------ */

function tick(now) {
  const delta = lastTick === null ? 0 : (now - lastTick) / 1000;
  lastTick = now;

  if (running) {
    const before = elapsed;
    elapsed += delta;
    checkCrossings(before, elapsed);
  }

  render(now);
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

function init() {
  buildPresetTabs();
  buildCueList();

  el.toggleBtn.addEventListener('click', toggle);
  el.resetBtn.addEventListener('click', reset);
  el.soundToggle.addEventListener('click', () => setMuted(!muted));

  for (const btn of el.nudgeBtns) {
    bindHold(btn, () => nudge(Number(btn.dataset.delta)));
  }

  window.addEventListener('keydown', onKeydown);
  document.addEventListener('visibilitychange', () => {
    // Coming back from a hidden tab, drop the hidden gap so we don't jump.
    if (!document.hidden) lastTick = null;
  });

  requestAnimationFrame(tick);
  // Background tabs throttle rAF to a stop, so keep a coarse watchdog that
  // only steps the clock while the tab is hidden. Without it, cues would stay
  // silent for the whole pull if the tab lost focus.
  window.setInterval(() => {
    if (document.hidden) tick(performance.now());
  }, 100);

  // Handy for tuning presets in devtools.
  window.wsc = { get elapsed() { return elapsed; }, get preset() { return preset(); } };
}

init();