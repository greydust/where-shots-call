# Where Shots Call

A boss mechanic cue timer for **Where Winds Meet**.

Press start, and every cue in the preset lights up on screen with a sound when
its timestamp comes around — so you can keep your eyes on the fight instead of
on a clock.

[Browse Where Shots Call](https://greydust.github.io/where-shots-call/)

## Features

- Count-up timeline with a large, high-contrast clock.
- Cue reminders: the matching row highlights for **5 seconds** and plays a sound.
- Fine-grained adjustments with **−10s / −1s / −0.5s / +0.5s / +1s / +10s** buttons.
  Press and hold to repeat.
- "Next cue" card with a live countdown, so you always know what is coming.
- Synthesized sounds via the Web Audio API — no audio files to download.
- Works on desktop and mobile. Keys stay usable while the tab is backgrounded.

## Keyboard

| Key | Action |
| --- | --- |
| <kbd>Space</kbd> | Start / pause |
| <kbd>R</kbd> | Reset |
| <kbd>↑</kbd> <kbd>↓</kbd> or <kbd>W</kbd> <kbd>S</kbd> | ±1s |
| <kbd>Shift</kbd> + <kbd>↑</kbd> / <kbd>↓</kbd> | ±10s |
| <kbd>Alt</kbd> + <kbd>↑</kbd> / <kbd>↓</kbd> | ±0.5s |
| <kbd>M</kbd> | Mute cue sounds |
| <kbd>1</kbd>–<kbd>9</kbd> | Switch preset |

## Presets

Presets live in [`data/presets.js`](data/presets.js) — one array, easy to edit.

```js
{
  id: 'guo-xin',
  name: 'Guo Xin',
  duration: 45,            // optional: length of the progress bar
  cues: [
    { t: 10, text: 'Start',  sound: 'chime' },
    { t: 27, text: 'Deflect', sound: 'thud' },
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

Available sounds: `chime`, `alert`, `thud`, `tick`, `fanfare`. All are
synthesized in the browser.

Currently included: **Guo Xin** and a placeholder for **Moongazing Maiden**
waiting on its timings.

## Deploy

GitHub Pages publishes this automatically on every push to `main` via
[`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml).

1. In the repository, go to **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Push to `main`.

For local testing, just open `index.html` — there is no build step.

Created by **greydust**. Unaffiliated with the game publisher.