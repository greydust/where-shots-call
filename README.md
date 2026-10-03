# Where Shots Call

A boss mechanic cue timer for **Where Winds Meet**.

Press start, and every cue in the preset lights up on screen with a sound when
its timestamp comes around — so you can keep your eyes on the fight instead of
on a clock.

[Browse Where Shots Call](https://greydust.github.io/where-shots-call/)

## Features

- Count-up timeline with a large, high-contrast clock.
- Cue reminders: the matching row highlights for **5 seconds** and plays a sound.
- Every cue row counts down to itself in the left column, then reverts to its
  own timestamp once it has passed.
- **Edit your cues in the browser** — change the timestamp, text or sound, add new
  cues, delete the ones you don't need.
- Fine-grained adjustments with **−10s / −1s / −0.5s / +0.5s / +1s / +10s** buttons.
  Press and hold to repeat.
- "Next cue" card with a live countdown, so you always know what is coming.
- Synthesized sounds via the Web Audio API — no audio files to download.
- Works on desktop and mobile.

### Stays accurate when you look away

Both the clock and the cue sounds survive a backgrounded or occluded window,
which matters when the fight keeps going while you alt-tab.

The clock is read from the wall clock rather than accumulated from animation
frames, so it cannot drift or freeze: browsers stop delivering
`requestAnimationFrame` when a window loses focus or is occluded, and a timer
built on frames dies there. A plain `setInterval` also backs it up for cue
scanning.

Sounds used to fire from that same JS timer, so a throttled background tab
delayed them — down to a minute once Chrome's intensive throttling engages.
They are now queued up to 120s ahead on the `AudioContext` clock, which runs on
its own thread and keeps real time regardless of page visibility. The timer
only tops the queue up. Pausing, rewinding or resetting throws the queue away
so a queued beep can never fire in the wrong place.

The only thing that can still lag while the tab is hidden is the visual
highlight, since nothing is being painted.

## Editing cues

Press **Edit** (or <kbd>E</kbd>) above the cue list. Each row turns into editable
fields:

| Field | Notes |
| --- | --- |
| Timestamp | Seconds from the start of the pull. Accepts halves, e.g. `27.5`. |
| Text | What you need to do. |
| Sound | Any id from the table below. |
| × | Deletes that cue. |

Changes save as you make them. Timestamps re-sort automatically, so you can type
them in any order. **Add cue** appends a new line after the last one and drops the
caret into it. Entering edit mode stops the clock so nothing fires mid-edit.

> **Edits are stored in this browser only** (`localStorage`), not in the
> repository. They apply to this device and browser profile. **Reset preset**
> throws them away and restores the values committed in `data/presets.js`; so does
> clearing site data. A preset with local edits is marked with a small dot on its
> tab, so you never have to guess whether what you're looking at came from the
> repo.

## Keyboard

| Key | Action |
| --- | --- |
| <kbd>Space</kbd> | Start / pause |
| <kbd>R</kbd> | Reset |
| <kbd>↑</kbd> <kbd>↓</kbd> or <kbd>W</kbd> <kbd>S</kbd> | ±1s |
| <kbd>Shift</kbd> + <kbd>↑</kbd> / <kbd>↓</kbd> | ±10s |
| <kbd>Alt</kbd> + <kbd>↑</kbd> / <kbd>↓</kbd> | ±0.5s |
| <kbd>E</kbd> | Toggle the cue editor |
| <kbd>M</kbd> | Mute cue sounds |
| <kbd>1</kbd>–<kbd>9</kbd> | Switch preset |

Shortcuts are ignored while you're typing in a cue field.

## Presets

[`data/presets.js`](data/presets.js) holds the built-in defaults — the values every
device loads before any browser-local edits:

```js
{
  id: 'guo-xin',
  name: 'Guo Xin',
  duration: 45,            // optional: length of the progress bar
  cues: [                  // abridged -- the real preset runs to 3:48
    { t: 10, text: 'Start',     sound: 'chime' },
    { t: 27, text: 'Deflect',   sound: 'thud' },
    { t: 28, text: 'Green 1',   sound: 'alert' },
    { t: 40, text: 'Shield 1',  sound: 'alert' },
    { t: 43, text: 'Cleanse 1', sound: 'alert' },
    { t: 53, text: 'Deflect',   sound: 'thud' },
  ],
}
```

| Field | Meaning |
| --- | --- |
| `id` | Unique slug. |
| `name` | Tab label. |
| `duration` | Optional cycle length in seconds. Omit it and the progress bar spans the last cue plus 10s. |
| `note` | Optional hint, shown while the preset has no cues. |
| `cues[].t` | Timestamp in seconds from the start of the pull. |
| `cues[].text` | What you need to do. |
| `cues[].sound` | Optional sound id; omit it for the default `chime`. |

Editing `data/presets.js` changes what a *fresh* browser loads. Existing browsers
that already saved local edits keep them until you use **Reset preset**.

Available sounds: `chime`, `alert`, `thud`, `tick`, `fanfare`. All are
synthesized in the browser.

Currently included, both fully timed out:

| Preset | Cues | Runs to |
| --- | --- | --- |
| Guo Xin | 12 | 3:48 |
| Moongazing Maiden | 12 | 3:53 |

## Deploy

GitHub Pages publishes this automatically on every push to `main` via
[`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml).

1. In the repository, go to **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Push to `main`.

For local testing, just open `index.html` — there is no build step.

Created by **greydust**. Unaffiliated with the game publisher.