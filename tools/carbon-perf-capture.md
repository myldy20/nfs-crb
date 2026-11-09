# Local Carbon performance capture

Use this opt-in probe on a running game that already exposes the performance
callbacks. It does not need a custom runtime or deployment, and does not read
saves, chat, player names or URLs. It keeps the summary in the browser and
prints it to the console; it makes no network requests of its own.

1. Start the game and enter the scene to measure.
2. Open Chrome DevTools Console (`Option+Command+J` on macOS).
3. Open `carbon-perf-capture.js` as raw text, copy all its contents, paste into
   the game page's console, and press Enter. Read the code before pasting it.
4. Close DevTools and drive: recording starts after eight seconds and lasts
   thirty seconds. Keep the tab visible and stay in the same scene.
5. Open Console again and copy the line starting with
   `{"type":"carbon-local-performance"`. The result is also available as
   `carbonPerfCapture.result`. To finish early, run `carbonPerfCapture.stop()`.

If Chrome blocks pasting, it displays instructions in the Console. If the
probe says the collector is unavailable or stopped, the site's collection may
have been disabled, exhausted its session budget, or stopped after an automatic
report. Start a fresh tab, load the game again, and retry; this probe cannot
enable disabled native instrumentation. The game itself can independently
send its pre-existing automatic performance reports under its own settings.

Compare the same scene and graphics settings for each frame-limit setting.
`newFps` counts new acknowledged images and `repeatPercent` counts repeated
ones. The frame interval includes repeats; p95 is the 95th percentile.
GPU samples cover instrumented render passes and exclude copies and final
composition. Waits overlap and must not be added together. A nonzero
`sceneChanges`, `hiddenEvents`, or `collectorStopped` makes a comparison
unreliable. GPU samples can be absent, and the probe may not work on every
deployed game version.
