/**
 * Cue data for the timer.
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
 *   sound optional sound id: 'chime' | 'alert' | 'thud' | 'tick' | 'fanfare'
 *         Omit it and the cue plays the default 'chime'.
 */

export const PRESETS = [
  {
    id: 'guo-xin',
    name: 'Guo Xin',
    cues: [
      { t: 10, text: 'Start', sound: 'chime' },
      { t: 27, text: 'Deflect', sound: 'thud' },
    ],
  },
  {
    id: 'moongazing-maiden',
    name: 'Moongazing Maiden',
    note: 'Cue timings not added yet.',
    cues: [],
  },
];