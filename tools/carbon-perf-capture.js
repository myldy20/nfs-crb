// Paste into the game's browser console. No network, profile, save or log access.
// Uses the existing optional performance callbacks; reload the page to remove it.
(() => {
  'use strict';
  const source = window.recompPerformance;
  if (window.carbonPerfCapture?.running) {
    console.warn('A Carbon performance capture is already running.');
    return;
  }
  if (!source?.enabled || typeof source.frame !== 'function') {
    console.warn('Performance callbacks are unavailable or stopped. Start the game in a fresh tab and try again.');
    return;
  }

  const delayMs = 8000, durationMs = 30000, startedAt = performance.now();
  const startAt = startedAt + delayMs, endAt = startAt + durationMs;
  const intervals = [], gpu = [], original = {}, wrapped = {};
  let fresh = 0, repeats = 0, renderSamples = 0, lastFrame = null, lastEpoch = null;
  let sceneChanges = 0, hiddenEvents = 0, drawableWidth = 0, drawableHeight = 0;
  const totals = {slot:0, yielded:0, blocked:0, ready:0, sleep:0, overrun:0, object:0,
                  encode:0, proxy:0, presenter:0};
  const finite = x => Number.isFinite(x) && x >= 0 ? x : 0;
  const round = x => Math.round(x * 100) / 100;
  const inWindow = () => performance.now() >= startAt && performance.now() < endAt && !document.hidden;
  const capture = {
    frame(at, cls, epoch, w, h, repeat, slot, yielded, blocked, ready, sleep, overrun, object) {
      if (!inWindow()) { lastFrame = null; return; }
      const signature = `${epoch}:${w}:${h}:${cls}`;
      if (lastEpoch !== null && signature !== lastEpoch) { sceneChanges++; lastFrame = null; }
      lastEpoch = signature;
      drawableWidth = finite(w); drawableHeight = finite(h);
      if (repeat) { repeats++; return; }
      fresh++;
      if (Number.isFinite(at)) {
        const gap = lastFrame === null ? 0 : at - lastFrame;
        if (gap > 0 && intervals.length < 10000) intervals.push(gap);
        lastFrame = at;
      }
      totals.slot += finite(slot); totals.yielded += finite(yielded);
      totals.blocked += finite(blocked); totals.ready += finite(ready);
      totals.sleep += finite(sleep); totals.overrun += finite(overrun); totals.object += finite(object);
    },
    render(at, encode, proxy, presenter) {
      if (!inWindow()) return;
      renderSamples++;
      totals.encode += finite(encode); totals.proxy += finite(proxy); totals.presenter += finite(presenter);
    },
    gpu(at, ms) {
      const sampleAt = at - performance.timeOrigin;
      if (inWindow() && Number.isFinite(sampleAt) && sampleAt >= startAt && sampleAt < endAt &&
          Number.isFinite(ms) && ms >= 0 && ms <= 10000 && gpu.length < 1000) gpu.push(ms);
    },
  };
  for (const name of Object.keys(capture)) {
    if (typeof source[name] !== 'function') continue;
    original[name] = source[name];
    wrapped[name] = function (...args) {
      try { capture[name](...args); } catch { /* diagnostics must not break the game */ }
      return original[name].apply(this, args);
    };
    source[name] = wrapped[name];
  }
  const onVisibility = () => { if (document.hidden && performance.now() >= startAt) { hiddenEvents++; lastFrame = null; } };
  document.addEventListener('visibilitychange', onVisibility);

  const controller = {
    running:true, result:null,
    stop() {
      if (!this.running) return this.result;
      this.running = false;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      for (const name of Object.keys(wrapped)) if (source[name] === wrapped[name]) source[name] = original[name];
      const seconds = Math.max(0, Math.min(performance.now(), endAt) - startAt) / 1000;
      const sorted = intervals.slice().sort((a,b) => a-b);
      const pct = q => sorted.length ? round(sorted[Math.ceil(sorted.length*q)-1]) : null;
      const avg = (value, n) => n ? round(value/n) : null;
      this.result = {
        type:'carbon-local-performance', version:1, seconds:round(seconds), newFrames:fresh,
        newFps:seconds ? round(fresh/seconds) : null, repeats,
        repeatPercent:fresh+repeats ? round(100*repeats/(fresh+repeats)) : null,
        frameIntervalMs:{median:pct(.5), p95:pct(.95), max:sorted.length ? round(sorted.at(-1)) : null},
        perNewFrameMs:{slotWait:avg(totals.slot,fresh), guestYield:avg(totals.yielded,fresh),
          guestBlocked:avg(totals.blocked,fresh), guestReadyWait:avg(totals.ready,fresh),
          guestSleepRequested:avg(totals.sleep,fresh), guestSleepOverrun:avg(totals.overrun,fresh),
          guestObjectWait:avg(totals.object,fresh)},
        render:{samples:renderSamples, meanEncodeMs:avg(totals.encode,renderSamples),
          meanProxyWaitMs:avg(totals.proxy,renderSamples), meanPresenterWaitMs:avg(totals.presenter,renderSamples)},
        gpu:{samples:gpu.length, meanRenderPassMs:avg(gpu.reduce((a,b)=>a+b,0),gpu.length)},
        drawableWidth, drawableHeight, sceneChanges, hiddenEvents, collectorStopped:!source.enabled,
        note:'Waits overlap; do not add them. GPU samples exclude copies and final composition. Scene changes, hidden tabs or a stopped collector invalidate simple comparisons.',
      };
      console.log('Carbon performance capture (copy the JSON below):');
      console.log(JSON.stringify(this.result));
      return this.result;
    },
  };
  window.carbonPerfCapture = controller;
  const timer = setTimeout(() => controller.stop(), delayMs + durationMs);
  console.log('Carbon capture armed: close DevTools and drive. Recording starts in 8 seconds and runs for 30 seconds. Reopen DevTools to copy the JSON.');
})();
