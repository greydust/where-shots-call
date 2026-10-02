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
      { t: 27, text: 'Deflect', sound: 'thud' },
      { t: 28, text: 'Green 1', sound: 'alert' },
    ],
  },
  {
    id: 'moongazing-maiden',
    name: 'Moongazing Maiden',
    note: 'Cue timings not added yet.',
    cues: [],
  },
];