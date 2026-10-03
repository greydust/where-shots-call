/**
 * Cue data for the timer.
 *
 * These are the BUILT-IN DEFAULTS. Edits you make in the app are saved to
 * this browser's localStorage and shadow this file. Use "Reset preset" in the
 * app to fall back to the values below, or clear site data to wipe everything.
 * Commit a change here to change what every device loads fresh.
 *
 * Each preset:
 *   id      unique slug (used for tab ids / persistence)
 *   name    display name
 *   cues    ordered list of cue lines
 *   duration  optional cycle length in seconds. Omit it and the progress bar
 *             simply spans the last cue plus a 10s tail.
 *   note    optional hint shown when the preset has no cues yet
 *
 * Each cue:
 *   t     timestamp in seconds from the start of the pull
 *   text  what you need to do
 *   sound optional sound id from SOUND_IDS. Omit it for the default 'chime'.
 */

/** Every sound the synth can play, in the order the editor offers them. */
export const SOUND_IDS = ['chime', 'alert', 'thud', 'tick', 'fanfare'];

export const PRESETS = [
  {
    id: 'guo-xin',
    name: 'Guo Xin',
    cues: [
      { t: 10, text: 'Start', sound: 'chime' },
      { t: 27, text: 'Deflect (in 3s)', sound: 'thud' },
      { t: 30, text: 'Green 1 (in 3s)', sound: 'alert' },
      { t: 40, text: 'Shield 1 (in 5s)', sound: 'alert' },
      { t: 54, text: 'Deflect (in 3s)', sound: 'thud' },
      { t: 59, text: 'Green 2 (in 3s)', sound: 'alert' },
      { t: 89, text: 'Green 3 (in 3s)', sound: 'alert' },
      { t: 116, text: 'Green 4 (in 3s)', sound: 'alert' },
      { t: 144, text: 'Green 5 (in 3s)', sound: 'alert' },
      { t: 172, text: 'Green 6 (in 3s)', sound: 'alert' },
      { t: 199, text: 'Green 7 (in 3s)', sound: 'alert' },
      { t: 228, text: 'Green 8 (in 3s)', sound: 'alert' },
    ],
  },
  {
    id: 'moongazing-maiden',
    name: 'Moongazing Maiden',
    note: 'Cue timings not added yet.',
    cues: [
      { t: 5, text: 'Start', sound: 'chime' },
      { t: 12, text: 'Green 1 (in 3s)', sound: 'alert' },
      { t: 34, text: 'Green 2 (in 3s)', sound: 'alert' },
      { t: 57, text: 'Green 3 (in 3s)', sound: 'alert' },
      { t: 78, text: 'Green 4 (in 3s)', sound: 'alert' },
      { t: 100, text: 'Green 5 (in 3s)', sound: 'alert' },
      { t: 123, text: 'Green 6 (in 3s)', sound: 'alert' },
      { t: 145, text: 'Green 7 (in 3s)', sound: 'alert' },
      { t: 166, text: 'Green 8 (in 3s)', sound: 'alert' },
      { t: 189, text: 'Green 9 (in 3s)', sound: 'alert' },
      { t: 212, text: 'Green 10 (in 3s)', sound: 'alert' },
      { t: 233, text: 'Green 11 (in 3s)', sound: 'alert' },
    ],
  },
];