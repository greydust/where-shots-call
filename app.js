import { PRESETS as DEFAULT_PRESETS, SOUND_IDS } from './data/presets.js';

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

/** How long a fired cue stays highlighted, in milliseconds. */
const HIGHLIGHT_MS = 5000;

/** Timestamps within this many seconds count as crossed (float tolerance). */
const EPS = 0.0005;

/** Edge length of the progress bar when a preset has no explicit duration. */
const TAIL_SECONDS = 10;

/** Where browser-local edits to the built-in presets are kept. */
const STORE_KEY = 'wsc.presets';

/** Seconds between two auto-added cues. */
const NEW_CUE_GAP = 5;

/**
 * How far ahead cue sounds are scheduled on the audio clock.
 *
 * Cue sounds used to fire straight from a setInterval, so a backgrounded tab
 * delayed them by however hard the browser was throttling timers -- up to a
 * minute once Chrome's intensive throttling kicks in. Sounds are now queued on
 * the AudioContext clock instead, which runs on its own thread and keeps
 * real time regardless of page visibility, so they land on the second. The
 * interval is only responsible for topping the queue up.
 */
const AUDIO_LOOKAHEAD = 120;

/** Volume the synth runs at when sound is not muted. */
const MASTER_GAIN = 0.5;

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
  editBtn: document.getElementById('editBtn'),
  editBar: document.getElementById('editBar'),
  addCueBtn: document.getElementById('addCueBtn'),
  resetPresetBtn: document.getElementById('resetPresetBtn'),
  soundToggle: document.getElementById('soundToggle'),
  soundToggleLabel: document.getElementById('soundToggleLabel'),
};

/* ------------------------------------------------------------------ */
/* Preset storage                                                      */
/* ------------------------------------------------------------------ */

/** Deep clone that only needs to handle plain JSON data. */
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/** Force a preset into the shape the app expects, discarding junk. */
function normalizePreset(preset) {
  const cues = Array.isArray(preset?.cues) ? preset.cues : [];
  const out = {
    id: String(preset?.id ?? 'preset'),
    name: String(preset?.name ?? 'Preset'),
    cues: cues
      .map((cue) => ({
        t: Math.max(0, Number(cue?.t) || 0),
        text: String(cue?.text ?? ''),
        sound: SOUND_IDS.includes(cue?.sound) ? cue.sound : DEFAULT_SOUND,
      }))
      .sort((a, b) => a.t - b.t),
  };
  if (typeof preset?.duration === 'number' && preset.duration > 0) out.duration = preset.duration;
  if (preset?.note) out.note = String(preset.note);
  return out;
}

/**
 * Built-in presets, overlaid with anything saved in this browser. If the
 * stored copy is unusable we silently fall back rather than leaving the app
 * without presets.
 */
function loadPresets() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return clone(DEFAULT_PRESETS);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) return clone(DEFAULT_PRESETS);
    return parsed.map(normalizePreset);
  } catch {
    return clone(DEFAULT_PRESETS);
  }
}

function savePresets() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(presets));
  } catch {
    // Private browsing or a full quota: edits just won't survive a reload.
  }
}

/** True when the live preset no longer matches the value in presets.js. */
function isEdited(index) {
  const live = presets[index];
  const base = DEFAULT_PRESETS.find((p) => p.id === live?.id);
  if (!base) return true;
  return JSON.stringify(normalizePreset(live)) !== JSON.stringify(normalizePreset(base));
}

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

/** @type {number} Index into PRESETS. */
let presetIndex = 0;

/**
 * Elapsed seconds. While running this is the value the clock had when the
 * current run began; the live reading is derived from the wall clock, never
 * from accumulated frame deltas. That keeps the timer correct even when the
 * browser stops delivering animation frames (backgrounded, occluded, or
 * unfocused windows), which is exactly when a boss pull is still ticking.
 */
let elapsed = 0;

/** Whether the clock is advancing. */
let running = false;

/** performance.now() at which the current run began. */
let runStart = 0;

/**
 * Elapsed value already scanned for cue crossings. Guards against double
 * processing, since both the animation frame loop and the interval below
 * call tick().
 */
let processed = 0;

/** Ids of cues that have already fired, so they fire once per pass. */
const fired = new Set();

/** Key -> wall-clock time it fired, used to expire the 5s highlight. */
const firedAt = new Map();

let muted = false;

/** Live presets: the built-in defaults with any browser-local edits applied. */
let presets = loadPresets();

/** Whether the cue list is showing inline editors instead of plain rows. */
let editing = false;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Stable id for a cue so `fired` survives re-renders and preset switches. */
function cueId(cue, index) {
  return `${cue.t}:${index}`;
}

/** Current preset, normalised so it always has an array of cues. */
function preset() {
  const p = presets[presetIndex] ?? { id: 'none', name: 'None', cues: [] };
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
      this.master.gain.value = muted ? 0 : MASTER_GAIN;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },

  /**
   * Mute by dropping the master gain rather than skipping playback, so sounds
   * already queued on the audio clock stay queued and play as soon as you
   * unmute.
   */
  setVolume(level) {
    if (!this.master) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(level, now, 0.01);
  },
};

/**
 * Nodes created by the sound currently being scheduled, so a queued cue can be
 * cancelled later (a rewind must not leave a beep pending).
 */
let capturing = null;

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

  const handle = { osc, amp, endsAt: t0 + dur + 0.05 };
  if (capturing) capturing.push(handle);
  return handle;
}

/** Synth cues. Keys match the `sound` field in data/presets.js. */
const SOUNDS = {
  /** Bright two-partial bell. Good default for "the fight starts". */
  chime(ctx, delay = 0) {
    voice({ freq: 880, delay, dur: 0.9, gain: 0.26 });
    voice({ freq: 880 * 2.76, delay, dur: 0.45, gain: 0.07 });
  },

  /** Three urgent blips. Use when reacting is time-critical. */
  alert(ctx, delay = 0) {
    [0, 0.14, 0.28].forEach((offset, i) => {
      voice({ type: 'square', freq: 720 + i * 180, delay: delay + offset, dur: 0.11, gain: 0.2 });
    });
  },

  /** Low impact with a pitch drop. Use for deflects and slams. */
  thud(ctx, delay = 0) {
    voice({ freq: 130, glideTo: 52, delay, dur: 0.5, gain: 0.4 });
    voice({ type: 'triangle', freq: 190, glideTo: 70, delay, dur: 0.22, gain: 0.12 });
  },

  /** Short dry click. */
  tick(ctx, delay = 0) {
    voice({ type: 'square', freq: 1500, delay, dur: 0.035, gain: 0.16 });
  },

  /** Rising arpeggio. Use for a phase change or a kill. */
  fanfare(ctx, delay = 0) {
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      voice({ freq, delay: delay + i * 0.1, dur: 0.34, gain: 0.22 });
    });
  },
};

function playSound(name) {
  try {
    const ctx = audio.unlock();
    if (!ctx) return;
    const fn = SOUNDS[name] ?? SOUNDS[DEFAULT_SOUND];
    fn(ctx);
  } catch {
    // Audio is a nice-to-have; never let it interrupt the timer or a cue.
  }
}

/* ------------------------------------------------------------------ */
/* Cue firing                                                          */
/* ------------------------------------------------------------------ */

/**
 * Cue sounds queued on the audio clock: cue id -> node handles.
 *
 * Only ever topped up forward. Anything that moves the clock (nudge, pause,
 * reset) throws the queue away and rebuilds it, so a queued beep can never
 * survive into a position where it no longer belongs.
 */
const queued = new Map();

/** Cancel every queued sound that has not played yet. */
function cancelQueued() {
  for (const handles of queued.values()) {
    for (const { osc } of handles) {
      try {
        osc.stop();
      } catch {
        // Already stopped or never started; nothing to do.
      }
    }
  }
  queued.clear();
}

/**
 * Queue any cue falling inside the lookahead window onto the audio clock.
 *
 * Called from the timer tick, so it only needs to stay roughly ahead of play
 * time -- the precision comes from the audio clock, not from when we get here.
 */
function queueUpcomingCues(cur) {
  if (!running) return;
  const ctx = audio.unlock();
  if (!ctx) return;

  const cues = cueList();
  const horizon = cur + AUDIO_LOOKAHEAD;

  // Forget cues whose sound has already played, so they can queue again on a
  // later pass through the same timestamp.
  for (const [id, handles] of queued) {
    if (handles.every((h) => h.endsAt <= ctx.currentTime)) queued.delete(id);
  }

  for (const cue of cues) {
    if (queued.has(cue.id) || fired.has(cue.id)) continue;
    if (cue.t > horizon) continue;

    capturing = [];
    try {
      (SOUNDS[cue.sound] ?? SOUNDS[DEFAULT_SOUND])(ctx, cue.t - cur);
    } finally {
      queued.set(cue.id, capturing ?? []);
      capturing = null;
    }
  }
}

/**
 * Fire every un-fired cue in the half-open range (processed, until].
 * This makes a forward nudge ring the cues it skipped over, and lets a cue
 * at 0:00 fire on the first tick after a reset.
 *
 * Highlight timing follows the timer, so it can lag while the tab is
 * backgrounded -- unavoidable, since nothing is being painted. The sound does
 * not: it is already queued on the audio clock.
 */
function processCrossings(until, now) {
  const hits = [];
  for (const cue of cueList()) {
    if (fired.has(cue.id)) continue;
    if (cue.t > processed - EPS && cue.t <= until + EPS) {
      fired.add(cue.id);
      hits.push(cue);
    }
  }
  processed = Math.max(processed, until);

  if (!hits.length) return;
  // Only the most recent one rings. Anything older was already queued on the
  // audio clock and will have sounded on time, so catching up after a long
  // stall never turns into a burst of noise.
  for (const cue of hits) announce(cue, now, cue === hits[hits.length - 1]);
}

function announce(cue, now, withSound) {
  firedAt.set(cue.id, now);

  // Fall back to playing immediately only if this cue never made it onto the
  // audio clock -- otherwise it is already queued and playing it here would
  // double it up.
  const wasQueued = queued.has(cue.id);
  queued.delete(cue.id);

  if (withSound) {
    if (!wasQueued) playSound(cue.sound);
    if (navigator.vibrate) navigator.vibrate(45);

    // Restart the border flash animation.
    el.app.classList.remove('is-cue-flash');
    void el.app.offsetWidth;
    el.app.classList.add('is-cue-flash');
    window.setTimeout(() => el.app.classList.remove('is-cue-flash'), 600);
  }
}

/* ------------------------------------------------------------------ */
/* Timer controls                                                      */
/* ------------------------------------------------------------------ */

/** Live reading of the clock, derived from the wall clock. */
function current(now = performance.now()) {
  return running ? elapsed + (now - runStart) / 1000 : elapsed;
}

function start() {
  if (running) return;
  try {
    audio.unlock(); // must never be able to stop the clock
  } catch {
    /* no audio available; cues stay silent */
  }
  processed = elapsed;
  runStart = performance.now();
  running = true;
  tick(performance.now());
}

function pause() {
  if (!running) return;
  elapsed = current();
  running = false;
  processed = elapsed;
  cancelQueued(); // nothing should beep after you stop
  tick(performance.now());
}

function toggle() {
  running ? pause() : start();
}

function reset() {
  running = false;
  elapsed = 0;
  runStart = 0;
  processed = 0;
  fired.clear();
  firedAt.clear();
  cancelQueued();
  render(0, performance.now());
}

/** Move the clock by `delta` seconds without breaking cue bookkeeping. */
function nudge(delta) {
  if (!delta) return;
  const now = performance.now();
  const before = current(now);
  elapsed = Math.max(0, before + delta);

  if (delta < 0) {
    // Rewinding: nothing may fire on the jump itself, and cues we pass back
    // over become eligible to ring again.
    processed = elapsed;
    for (const id of fired) {
      const cue = cueList().find((c) => c.id === id);
      if (!cue || cue.t > elapsed) fired.delete(id);
    }
  } else {
    processCrossings(elapsed, now);
  }

  // Every queued beep was placed relative to the old position, so drop the
  // lot and let the next tick re-queue from here.
  cancelQueued();
  queueUpcomingCues(elapsed);
  render(elapsed, now);
}

/* ------------------------------------------------------------------ */
/* Render                                                              */
/* ------------------------------------------------------------------ */

function render(cur, now) {
  const cues = cueList();
  const next = cues.find((cue) => cue.t > cur + EPS && !fired.has(cue.id));

  el.clock.textContent = formatTime(cur);
  el.clockState.textContent = running ? 'Running' : cur > 0 ? 'Paused' : 'Ready';
  el.app.dataset.running = String(running);
  el.toggleBtn.textContent = running ? 'Pause' : cur > 0 ? 'Resume' : 'Start';

  // Next cue card
  el.nextCue.dataset.empty = String(!next);
  el.nextCue.classList.toggle('is-next', Boolean(next));
  if (next) {
    el.nextCueText.textContent = next.text;
    const away = Math.max(0, next.t - cur);
    el.nextCueIn.textContent = away >= 10 ? `in ${Math.round(away)}s` : `in ${away.toFixed(1)}s`;
  } else if (cues.length && cur >= cues[cues.length - 1].t - EPS) {
    el.nextCueText.textContent = 'All cues done';
    el.nextCueIn.textContent = '';
  } else {
    el.nextCueText.textContent = '—';
    el.nextCueIn.textContent = '';
  }

  // Progress bar
  const pct = Math.min(100, (cur / span()) * 100);
  el.progressBar.style.width = `${pct}%`;
  el.progress.setAttribute('aria-valuenow', String(Math.round(pct)));

  // Cue rows
  for (const li of el.cueList.children) {
    const cue = cues[Number(li.dataset.index)];
    if (!cue) continue;
    const active = (firedAt.get(cue.id) ?? -Infinity) + HIGHLIGHT_MS > now;
    li.classList.toggle('is-active', active);
    li.classList.toggle('is-next', cue === next);

    // The left cell counts down to this cue, then falls back to showing the
    // cue's own timestamp once it has gone by. Only rewrite when the displayed
    // value actually changes, otherwise every frame would touch the DOM.
    const away = cue.t - cur;
    const upcoming = away > EPS;
    const label = upcoming
      ? away >= 10
        ? `in ${Math.round(away)}s`
        : `in ${away.toFixed(1)}s`
      : formatTime(cue.t);

    li.classList.toggle('is-past', !upcoming);
    if (li.dataset.label !== label) {
      li.dataset.label = label;
      const cell = li.querySelector('.cue-t');
      if (cell) cell.textContent = label;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Preset wiring                                                       */
/* ------------------------------------------------------------------ */

function buildPresetTabs() {
  el.presetTabs.replaceChildren();
  presets.forEach((preset, index) => {
    const count = preset.cues?.length ?? 0;
    const btn = document.createElement('button');
    btn.className = 'preset-tab';
    btn.type = 'button';
    btn.role = 'tab';
    btn.id = `tab-${preset.id}`;
    btn.setAttribute('aria-selected', String(index === presetIndex));
    btn.append(preset.name);

    if (isEdited(index)) {
      const dot = document.createElement('span');
      dot.className = 'preset-dot';
      dot.title = 'Edited on this device';
      btn.append(dot);
    }

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

/** Rebuild both the tabs and the cue list, then repaint. */
function rebuild() {
  buildPresetTabs();
  buildCueList();
  render(current(), performance.now());
}

/* ------------------------------------------------------------------ */
/* Cue editing                                                         */
/* ------------------------------------------------------------------ */

/**
 * Change one field of one cue. Saves immediately but deliberately does not
 * re-render: rebuilding the list mid-keystroke would steal focus from the
 * field being typed into.
 */
function mutateCue(index, patch) {
  const cue = presets[presetIndex]?.cues?.[index];
  if (!cue) return;
  Object.assign(cue, patch);
  savePresets();
}

/** Re-sort and repaint after a structural or timestamp change. */
function commitCues() {
  const p = presets[presetIndex];
  if (p) p.cues = normalizePreset(p).cues;
  savePresets();
  rebuild();
}

function addCue() {
  const p = presets[presetIndex];
  if (!p) return;
  const cues = p.cues;
  const last = cues.length ? cues[cues.length - 1].t : 0;
  cues.push({
    t: Math.round((last + NEW_CUE_GAP) * 2) / 2,
    text: 'New cue',
    sound: DEFAULT_SOUND,
  });
  commitCues();

  // Land the caret in the row we just created.
  const rows = [...el.cueList.children];
  const added = rows.find((li) => li.querySelector('.cue-text-input')?.value === 'New cue');
  const field = added?.querySelector('.cue-text-input');
  field?.focus();
  field?.select();
}

function deleteCue(index) {
  const p = presets[presetIndex];
  if (!p?.cues[index]) return;
  p.cues.splice(index, 1);
  savePresets();
  // Deleting invalidates the "already fired" bookkeeping for that row.
  fired.clear();
  processed = current();
  rebuild();
}

/** Throw away browser-local edits and go back to the committed defaults. */
function resetPreset() {
  const base = DEFAULT_PRESETS.find((p) => p.id === presets[presetIndex]?.id);
  if (!base) return;
  presets[presetIndex] = clone(base);
  savePresets();
  fired.clear();
  processed = current();
  rebuild();
}

function setEditing(next) {
  if (editing === next) return;
  editing = next;
  // Stop the clock so nothing fires halfway through an edit.
  if (editing) pause();
  el.editBtn.textContent = editing ? 'Done' : 'Edit';
  el.editBtn.setAttribute('aria-pressed', String(editing));
  el.editBar.hidden = !editing;
  rebuild();
}

/** Build the inline editor controls for one cue row. */
function buildCueEditor(li, cue, index) {
  const time = document.createElement('input');
  time.type = 'number';
  time.min = '0';
  time.step = '0.5';
  time.value = String(cue.t);
  time.className = 'cue-t-input';
  time.setAttribute('aria-label', 'Timestamp in seconds');
  time.addEventListener('input', () => mutateCue(index, { t: Math.max(0, Number(time.value) || 0) }));
  time.addEventListener('change', commitCues);

  const text = document.createElement('input');
  text.type = 'text';
  text.value = cue.text;
  text.className = 'cue-text-input';
  text.setAttribute('aria-label', 'Cue text');
  text.addEventListener('input', () => mutateCue(index, { text: text.value }));
  text.addEventListener('change', () => render(current(), performance.now()));

  const sound = document.createElement('select');
  sound.className = 'cue-sound-input';
  sound.setAttribute('aria-label', 'Cue sound');
  for (const id of SOUND_IDS) {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = id;
    option.selected = id === cue.sound;
    sound.append(option);
  }
  sound.addEventListener('change', () => mutateCue(index, { sound: sound.value }));

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'cue-del';
  remove.textContent = '\u00d7';
  remove.title = `Delete "${cue.text}"`;
  remove.setAttribute('aria-label', `Delete cue ${cue.text} at ${formatTime(cue.t)}`);
  remove.addEventListener('click', () => deleteCue(index));

  li.append(time, text, sound, remove);
}

function buildCueList() {
  const cues = cueList();
  el.cueList.replaceChildren();

  cues.forEach((cue, index) => {
    const li = document.createElement('li');
    li.className = editing ? 'cue cue-edit' : 'cue';
    li.dataset.index = String(index);

    if (editing) {
      buildCueEditor(li, cue, index);
    } else {
      const time = document.createElement('span');
      time.className = 'cue-t';
      time.textContent = formatTime(cue.t);

      const text = document.createElement('span');
      text.className = 'cue-text';
      text.textContent = cue.text;

      const sound = document.createElement('span');
      sound.className = 'cue-sound';
      sound.textContent = cue.sound ?? DEFAULT_SOUND;

      // The left cell doubles as this cue's countdown while it is still
      // upcoming; render() rewrites it as the timer runs.
      li.append(time, text, sound);
    }
    el.cueList.append(li);
  });

  const note = preset().note;
  el.cueNote.hidden = !(note && cues.length === 0);
  el.cueNote.textContent = note ?? '';
}

function selectPreset(index) {
  if (index === presetIndex || !presets[index]) return;
  presetIndex = index;
  for (const btn of el.presetTabs.children) {
    btn.setAttribute('aria-selected', String(btn === el.presetTabs.children[index]));
  }
  // Editing belongs to one preset at a time.
  if (editing) setEditing(false);
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
  // Gain-based so sounds already queued on the audio clock survive the mute
  // and play the moment it is lifted.
  audio.setVolume(muted ? 0 : MASTER_GAIN);
  el.soundToggle.setAttribute('aria-pressed', String(muted));
  el.soundToggleLabel.textContent = muted ? 'Muted' : 'Sound on';
}

function onKeydown(event) {
  const tag = event.target?.tagName;
  // Never steal keys from a field the user is editing a cue in.
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || event.metaKey || event.ctrlKey) return;

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
  } else if (key === 'e') {
    setEditing(!editing);
  } else if (/^[1-9]$/.test(key)) {
    selectPreset(Number(key) - 1);
  }
}

/* ------------------------------------------------------------------ */
/* Loop                                                                */
/* ------------------------------------------------------------------ */

/**
 * Advance one step. Safe to call from several drivers: `processed` makes the
 * cue scan idempotent, so the interval and the animation frame can both call
 * it and only the first one finds a crossing.
 */
function tick(now = performance.now()) {
  const cur = current(now);
  if (running) {
    queueUpcomingCues(cur);
    processCrossings(cur, now);
  }
  render(cur, now);
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
  el.editBtn.addEventListener('click', () => setEditing(!editing));
  el.addCueBtn.addEventListener('click', addCue);
  el.resetPresetBtn.addEventListener('click', resetPreset);

  for (const btn of el.nudgeBtns) {
    bindHold(btn, () => nudge(Number(btn.dataset.delta)));
  }

  window.addEventListener('keydown', onKeydown);

  // Two drivers on purpose.
  //
  // requestAnimationFrame gives a smooth display, but the browser stops
  // delivering frames whenever the window is unfocused, occluded or
  // minimised -- and it reports document.hidden === false the whole time.
  // Keying the clock off frames alone therefore froze the timer the moment
  // you looked away, which is the one thing a boss timer must not do.
  //
  // The interval keeps running in that state (throttled to roughly 1s by
  // background tabs) so cues still fire and the clock stays honest. Time is
  // read from performance.now() rather than summed from deltas, so nothing
  // drifts no matter how irregular the ticks are.
  const frame = (now) => {
    tick(now);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  window.setInterval(() => {
    if (running || firedAt.size) tick();
  }, 200);

  // Handy for tuning presets in devtools.
  window.wsc = {
    get elapsed() { return current(); },
    get running() { return running; },
    get preset() { return preset(); },
  };
}

init();